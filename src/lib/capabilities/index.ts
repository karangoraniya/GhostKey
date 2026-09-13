import "server-only";
import { approvalEvent } from "@/lib/approvals/activity";
import { randomBytes } from "node:crypto";
import { awsActions, githubActions, type AwsAction, type AwsCapability, type GitHubCapability, type GitHubAction, type Capability } from "@/types/broker";
import { getGhostIdentity } from "@/lib/broker/ghostIdentity";
import { state } from "@/lib/broker/state";
import { BrokerError } from "@/lib/broker/errors";
import { bucketName } from "@/lib/providers/aws/validation";
import { repository, ttl } from "@/lib/broker/validation";

type GitHubGrant = { ghostId: string; provider: "github"; owner: string; repo: string; actions: GitHubAction[]; ttlSeconds: number };
type AwsGrant = { ghostId: string; provider: "aws"; bucket: string; actions: AwsAction[]; ttlSeconds: number };
export function createCapability(input: GitHubGrant): GitHubCapability;
export function createCapability(input: AwsGrant): AwsCapability;
export function createCapability(input: GitHubGrant | AwsGrant): Capability {
  const ghost = getGhostIdentity(input.ghostId);
  if (input.provider !== "github" && input.provider !== "aws") throw new BrokerError("PROVIDER_NOT_ALLOWED");
  const allowed: readonly string[] = input.provider === "aws" ? awsActions : githubActions;
  if (!Array.isArray(input.actions) || !input.actions.length || input.actions.some(action => !allowed.includes(action))) throw new BrokerError("ACTION_NOT_ALLOWED");
  const now = Date.now();
  const common = { id: `cap_${randomBytes(32).toString("hex")}`, ghostId: ghost.id,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(Math.min(now + ttl(input.ttlSeconds) * 1000, Date.parse(ghost.expiresAt))).toISOString() };
  const capability: Capability = input.provider === "github"
    ? { ...common, provider: "github", resource: repository(input.owner, input.repo), actions: [...new Set(input.actions)] }
    : { ...common, provider: "aws", resource: { service: "s3", bucket: bucketName(input.bucket) }, actions: [...new Set(input.actions)] };
  state.capabilities.set(capability.id, capability);
  return structuredClone(capability);
}
export function validateCapability(input: { capabilityId: string; provider: string; action: string; owner?: string; repo?: string; bucket?: string; ghostId?: string }) {
  const capability = state.capabilities.get(input.capabilityId);
  if (!capability) throw new BrokerError("CAPABILITY_NOT_FOUND", 404);
  if (state.revoked.has(capability.id)) throw new BrokerError("CAPABILITY_REVOKED");
  if (Date.parse(capability.expiresAt) <= Date.now()) {
    if (capability.approvalId) approvalEvent("capability.expired", capability.approvalId);
    throw new BrokerError("CAPABILITY_EXPIRED");
  }
  getGhostIdentity(capability.ghostId);
  if (input.ghostId !== undefined) {
    getGhostIdentity(input.ghostId);
    if (input.ghostId !== capability.ghostId) throw new BrokerError("GHOST_MISMATCH");
  }
  if (input.provider !== capability.provider) throw new BrokerError("PROVIDER_NOT_ALLOWED");
  if (!capability.actions.some(action => action === input.action)) throw new BrokerError("ACTION_NOT_ALLOWED");
  if (capability.provider === "github") {
    const resource = repository(input.owner, input.repo);
    if (resource.owner !== capability.resource.owner || resource.repo !== capability.resource.repo) throw new BrokerError("RESOURCE_NOT_ALLOWED");
  } else {
    if (!input.ghostId) throw new BrokerError("INVALID_INPUT", 400);
    if (bucketName(input.bucket) !== capability.resource.bucket) throw new BrokerError("RESOURCE_NOT_ALLOWED");
  }
  return structuredClone(capability);
}
export function revokeCapability(id: string) {
  if (!state.capabilities.has(id)) throw new BrokerError("CAPABILITY_NOT_FOUND", 404);
  state.revoked.add(id);
}

// Listing never loads credentials and returns only active grants owned by this ghost.
export function listGhostCapabilities(ghostId: string) {
  getGhostIdentity(ghostId);
  return [...state.capabilities.values()]
    .filter(cap => cap.ghostId === ghostId && !state.revoked.has(cap.id) && Date.parse(cap.expiresAt) > Date.now())
    .map(cap => ({ capabilityId: cap.id, provider: cap.provider, resource: { ...cap.resource },
      actions: [...cap.actions], expiresAt: cap.expiresAt }));
}
