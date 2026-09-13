import "server-only";
import { randomBytes } from "node:crypto";
import { getAddress, type Hex } from "viem";
import { getGhostIdentity } from "@/lib/broker/ghostIdentity";
import { state } from "@/lib/broker/state";
import { repository } from "@/lib/broker/validation";
import { BrokerError } from "@/lib/broker/errors";
import { getLedgerDeviceStatus } from "@/lib/ledger/dmk";
import { signApprovalChallenge } from "@/lib/ledger/approvalSigner";
import type { Approval, ApprovalBinding, DeviceStatus } from "@/types/approval";
import type { Capability } from "@/types/broker";
import { approvalStore, type createApprovalStore } from "./approvalStore";
import { createApprovalChallenge, verifyApprovalSignature } from "./challenge";
import { approvalEvent, approvalEvents } from "./activity";

type Dependencies = {
  getWallet: () => Promise<DeviceStatus>;
  sign: (challenge: ReturnType<typeof createApprovalChallenge>, expected: Hex) => Promise<Hex>;
  store: ReturnType<typeof createApprovalStore>;
};
export function validateApprovalBinding(input: unknown): ApprovalBinding {
  if (!input || typeof input !== "object") throw new BrokerError("INVALID_INPUT", 400);
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => !["ghostId", "requestedAction", "resource"].includes(key)) ||
      typeof data.ghostId !== "string" || !/^ghost_[a-f0-9]{48}$/.test(data.ghostId) ||
      data.requestedAction !== "github.admin.write" || typeof data.resource !== "string") throw new BrokerError("INVALID_APPROVAL_REQUEST", 400);
  const parts = data.resource.split("/");
  if (parts.length !== 2) throw new BrokerError("INVALID_RESOURCE", 400);
  const resource = repository(parts[0], parts[1]);
  return { ghostId: data.ghostId, requestedAction: "github.admin.write", resource: `${resource.owner}/${resource.repo}` };
}
export function createApprovalService({ getWallet, sign, store }: Dependencies) {
  function load(id: string) {
    const approval = store.approvals.get(id);
    if (!approval) throw new BrokerError("APPROVAL_NOT_FOUND", 404);
    if (["PENDING", "APPROVED"].includes(approval.status) && Date.parse(approval.expiresAt) <= Date.now()) {
      approval.status = "EXPIRED";
      approvalEvent("approval.expired", id);
    }
    return approval;
  }
  function bind(approval: Approval, input: ApprovalBinding) {
    const binding = validateApprovalBinding(input);
    if (binding.ghostId !== approval.ghostId) throw new BrokerError("GHOST_MISMATCH");
    if (binding.requestedAction !== approval.requestedAction || binding.resource !== approval.resource) throw new BrokerError("APPROVAL_SCOPE_MISMATCH");
    getGhostIdentity(binding.ghostId);
    if (approval.status === "EXPIRED") throw new BrokerError("APPROVAL_EXPIRED");
  }
  function view(id: string) {
    const approval = load(id);
    const cap = approval.capabilityId ? state.capabilities.get(approval.capabilityId) : undefined;
    if (cap && Date.parse(cap.expiresAt) <= Date.now()) approvalEvent("capability.expired", id);
    return { ...structuredClone(approval), capability: cap?.provider === "github" ? structuredClone(cap) : undefined, events: approvalEvents(id) };
  }
  async function requestApproval(raw: ApprovalBinding) {
    const binding = validateApprovalBinding(raw);
    getGhostIdentity(binding.ghostId);
    const isGranted = () => [...state.capabilities.values()].some(cap => cap.provider === "github" && cap.ghostId === binding.ghostId &&
      !state.revoked.has(cap.id) && Date.parse(cap.expiresAt) > Date.now() &&
      cap.actions.some(action => action === binding.requestedAction) && `${cap.resource.owner}/${cap.resource.repo}` === binding.resource);
    if (isGranted()) throw new BrokerError("ALREADY_GRANTED", 409);
    // Public address read, not a signature. Pin the wallet before the signing request.
    const wallet = await getWallet();
    if (wallet.status !== "READY" || !wallet.address) throw new BrokerError(wallet.error ?? "LEDGER_NOT_READY", 503);
    const ghost = getGhostIdentity(binding.ghostId);
    if (isGranted()) throw new BrokerError("ALREADY_GRANTED", 409);
    const nonce = `0x${randomBytes(32).toString("hex")}` as Hex;
    if (store.nonces.has(nonce)) throw new BrokerError("NONCE_REUSED");
    store.nonces.add(nonce);
    const approval: Approval = { ...binding, id: `approval_${randomBytes(24).toString("hex")}`, risk: "HIGH", status: "PENDING",
      createdAt: new Date(Date.now()).toISOString(), expiresAt: new Date(Math.min(Date.now() + 600000, Date.parse(ghost.expiresAt))).toISOString(),
      nonce, walletAddress: getAddress(wallet.address), signing: false };
    store.approvals.set(approval.id, approval);
    approvalEvent("approval.requested", approval.id);
    return view(approval.id);
  }
  function grantCapabilityFromApproval(id: string, binding: ApprovalBinding) {
    const approval = load(id);
    bind(approval, binding);
    if (approval.consumedAt || store.consumedNonces.has(approval.nonce)) throw new BrokerError("APPROVAL_ALREADY_USED", 409);
    if (approval.status !== "APPROVED") throw new BrokerError("APPROVAL_NOT_APPROVED");
    const ghost = getGhostIdentity(approval.ghostId);
    const [owner, repo] = approval.resource.split("/");
    const cap: Capability = { id: `cap_${randomBytes(32).toString("hex")}`, ghostId: ghost.id, provider: "github",
      resource: { owner, repo }, actions: ["github.admin.write"], risk: "HIGH", source: "ledger-hardware-approval", approvalId: id,
      createdAt: new Date(Date.now()).toISOString(),
      expiresAt: new Date(Math.min(Date.now() + 300000, Date.parse(ghost.expiresAt), Date.parse(approval.expiresAt))).toISOString() };
    // Synchronous commit: one nonce can mint exactly one capability, with no await gap.
    store.consumedNonces.add(approval.nonce);
    approval.consumedAt = new Date(Date.now()).toISOString();
    approval.capabilityId = cap.id;
    state.capabilities.set(cap.id, cap);
    approvalEvent("capability.elevated", id);
    return structuredClone(cap);
  }
  async function approveWithLedger(id: string, binding: ApprovalBinding) {
    const approval = load(id);
    bind(approval, binding);
    if (approval.consumedAt) throw new BrokerError("APPROVAL_ALREADY_USED", 409);
    if (approval.status !== "PENDING") throw new BrokerError("APPROVAL_NOT_PENDING", 409);
    if (approval.signing) throw new BrokerError("APPROVAL_IN_PROGRESS", 409);
    approval.signing = true;
    approvalEvent("approval.ledger_started", id);
    // Immutable snapshot determines exactly what the hardware must sign.
    const challenge = createApprovalChallenge(approval);
    try {
      const signature = await sign(challenge, approval.walletAddress);
      const verification = await verifyApprovalSignature(challenge, signature, approval.walletAddress);
      if (!verification.valid) throw new BrokerError("SIGNATURE_INVALID");
      bind(load(id), binding);
      if (approval.status !== "PENDING") throw new BrokerError("APPROVAL_NOT_PENDING", 409);
      // Detect any server-side scope mutation while hardware signing was in progress.
      if (JSON.stringify(challenge) !== JSON.stringify(createApprovalChallenge(approval))) throw new BrokerError("APPROVAL_SCOPE_MISMATCH");
      if (store.consumedNonces.has(approval.nonce)) throw new BrokerError("NONCE_REUSED");
      approval.status = "APPROVED";
      approval.approvedAt = new Date(Date.now()).toISOString();
      approvalEvent("approval.approved", id);
      grantCapabilityFromApproval(id, binding);
    } catch (error) {
      // A UI rejection or expiry during signing must win over a late signature.
      load(id);
      if (approval.status === "PENDING" || approval.status === "APPROVED") {
        const code = error instanceof BrokerError ? error.code : "SIGNATURE_INVALID";
        approval.status = code === "LEDGER_REJECTED" ? "REJECTED" : "FAILED";
        approval.error = code;
        approvalEvent(approval.status === "REJECTED" ? "approval.rejected" : "approval.failed", id);
      }
    } finally { approval.signing = false; }
    return view(id);
  }
  function rejectApproval(id: string, binding: ApprovalBinding) {
    const approval = load(id); bind(approval, binding);
    if (approval.status !== "PENDING") throw new BrokerError("APPROVAL_NOT_PENDING", 409);
    approval.status = "REJECTED";
    approvalEvent("approval.rejected", id);
    return view(id);
  }
  return { requestApproval, approveWithLedger, grantCapabilityFromApproval, rejectApproval, getApproval: view };
}
export const approvalService = createApprovalService({ getWallet: getLedgerDeviceStatus, sign: signApprovalChallenge, store: approvalStore });
export const grantCapabilityFromApproval = approvalService.grantCapabilityFromApproval;
