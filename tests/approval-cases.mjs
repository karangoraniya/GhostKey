import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { of, NEVER } from "rxjs";

export async function approvalTests(t, load, { advance }) {
  const { createApprovalService } = await load("lib/approvals/approvalService");
  const { createApprovalStore } = await load("lib/approvals/approvalStore");
  const { createGhostIdentity, expireGhostIdentity } = await load("lib/broker/ghostIdentity");
  const { validateCapability, createCapability } = await load("lib/capabilities/index");
  const { HardwareError } = await load("lib/ledger/hardwareErrors");
  const { awaitDeviceAction } = await load("lib/ledger/deviceAction");
  const { approvalResponse } = await load("lib/approvals/response");
  const account = privateKeyToAccount(generatePrivateKey()); // Ephemeral test key, never a Ledger credential.
  function fixture(sign = challenge => account.signTypedData(challenge)) {
    const ghost = createGhostIdentity({ name: "hardware-test", ttlSeconds: 1800 });
    const binding = { ghostId: ghost.id, requestedAction: "github.admin.write", resource: "owner/hardware-test" };
    const store = createApprovalStore();
    let calls = 0;
    const service = createApprovalService({ store, getWallet: async () => ({ status: "READY", address: account.address }),
      sign: async (...args) => { calls++; return sign(...args); } });
    return { service, store, binding, ghost, calls: () => calls };
  }
  await t.test("approval starts pending; UI flags and normal capability minting cannot elevate", async () => {
    const f = fixture(); const approval = await f.service.requestApproval(f.binding);
    assert.equal(approval.status, "PENDING"); assert.equal(f.calls(), 0);
    assert.match(approval.nonce, /^0x[a-f0-9]{64}$/);
    assert.throws(() => f.service.grantCapabilityFromApproval(approval.id, f.binding), { code: "APPROVAL_NOT_APPROVED" });
    await assert.rejects(f.service.requestApproval({ ...f.binding, approved: true }), { code: "INVALID_APPROVAL_REQUEST" });
    assert.throws(() => createCapability({ ghostId: f.ghost.id, provider: "github", owner: "owner", repo: "hardware-test", actions: ["github.admin.write"], ttlSeconds: 300 }), { code: "ACTION_NOT_ALLOWED" });
    assert.equal("nonce" in approvalResponse(approval), false);
  });
  await t.test("real valid typed-data signature grants matching five-minute capability, then expires", async () => {
    const f = fixture(); const pending = await f.service.requestApproval(f.binding);
    const approved = await f.service.approveWithLedger(pending.id, f.binding);
    assert.equal(approved.status, "APPROVED");
    const cap = approved.capability;
    assert.equal(cap.ghostId, f.ghost.id); assert.deepEqual(cap.actions, ["github.admin.write"]);
    assert.deepEqual(cap.resource, { owner: "owner", repo: "hardware-test" });
    assert.equal(cap.source, "ledger-hardware-approval"); assert.equal(cap.risk, "HIGH");
    assert.equal(Date.parse(cap.expiresAt) - Date.parse(cap.createdAt), 300000);
    const input = { capabilityId: cap.id, ghostId: f.ghost.id, provider: "github", owner: "owner", repo: "hardware-test", action: "github.admin.write" };
    assert.equal(validateCapability(input).id, cap.id);
    await assert.rejects(f.service.approveWithLedger(pending.id, f.binding), { code: "APPROVAL_ALREADY_USED" });
    assert.throws(() => f.service.grantCapabilityFromApproval(pending.id, f.binding), { code: "APPROVAL_ALREADY_USED" });
    advance(300000); assert.throws(() => validateCapability(input), { code: "CAPABILITY_EXPIRED" });
  });
  await t.test("malformed signatures and wrong signers grant nothing", async () => {
    const other = privateKeyToAccount(generatePrivateKey());
    for (const sign of [async () => "0x1234", challenge => other.signTypedData(challenge)]) {
      const f = fixture(sign); const pending = await f.service.requestApproval(f.binding);
      const result = await f.service.approveWithLedger(pending.id, f.binding);
      assert.equal(result.status, "FAILED"); assert.equal(result.error, "SIGNATURE_INVALID"); assert.equal(result.capability, undefined);
    }
  });
  await t.test("physical rejection, disconnect, and app closure grant nothing", async () => {
    for (const code of ["LEDGER_REJECTED", "DEVICE_NOT_CONNECTED", "ETHEREUM_APP_REQUIRED"]) {
      const f = fixture(async () => { throw new HardwareError(code); });
      const pending = await f.service.requestApproval(f.binding);
      const result = await f.service.approveWithLedger(pending.id, f.binding);
      assert.equal(result.status, code === "LEDGER_REJECTED" ? "REJECTED" : "FAILED");
      assert.equal(result.capability, undefined);
      assert.throws(() => f.service.grantCapabilityFromApproval(pending.id, f.binding), { code: "APPROVAL_NOT_APPROVED" });
    }
  });
  await t.test("expired approvals and wrong ghost/action/resource are rejected before signing", async () => {
    const f = fixture(); const pending = await f.service.requestApproval(f.binding);
    const other = fixture();
    for (const [binding, code] of [[{ ...f.binding, ghostId: other.ghost.id }, "GHOST_MISMATCH"],
      [{ ...f.binding, requestedAction: "github.repo.delete" }, "INVALID_APPROVAL_REQUEST"],
      [{ ...f.binding, resource: "owner/other" }, "APPROVAL_SCOPE_MISMATCH"]]) {
      await assert.rejects(f.service.approveWithLedger(pending.id, binding), { code });
    }
    advance(600000);
    await assert.rejects(f.service.approveWithLedger(pending.id, f.binding), { code: "APPROVAL_EXPIRED" });
    assert.equal(f.calls(), 0);
  });
  await t.test("UI rejection wins over a late valid signature and concurrent signing is refused", async () => {
    let release;
    const f = fixture(challenge => new Promise(resolve => { release = async () => resolve(await account.signTypedData(challenge)); }));
    const pending = await f.service.requestApproval(f.binding);
    const signing = f.service.approveWithLedger(pending.id, f.binding);
    await assert.rejects(f.service.approveWithLedger(pending.id, f.binding), { code: "APPROVAL_IN_PROGRESS" });
    f.service.rejectApproval(pending.id, f.binding); await release();
    const result = await signing;
    assert.equal(result.status, "REJECTED"); assert.equal(result.capability, undefined);
  });
  await t.test("expiry and ghost invalidation during signing prevent grants", async () => {
    for (const invalidate of [() => advance(600000), f => expireGhostIdentity(f.ghost.id)]) {
      let f;
      f = fixture(async challenge => { invalidate(f); return account.signTypedData(challenge); });
      const pending = await f.service.requestApproval(f.binding);
      const result = await f.service.approveWithLedger(pending.id, f.binding);
      assert.ok(["EXPIRED", "FAILED"].includes(result.status)); assert.equal(result.capability, undefined);
    }
  });
  await t.test("a consumed nonce and altered challenge cannot grant authority", async () => {
    for (const mutate of [record => { record.resource = "owner/other"; }, (record, store) => { store.consumedNonces.add(record.nonce); }]) {
      let f, pending;
      f = fixture(async challenge => { mutate(f.store.approvals.get(pending.id), f.store); return account.signTypedData(challenge); });
      pending = await f.service.requestApproval(f.binding);
      const result = await f.service.approveWithLedger(pending.id, f.binding);
      assert.equal(result.status, "FAILED"); assert.equal(result.capability, undefined);
    }
  });
  await t.test("device action rejects physical refusal, blind fallback, stop, and timeout", async () => {
    for (const [observable, code] of [
      [of({ status: "error", error: { errorCode: "6985" } }), "LEDGER_REJECTED"],
      [of({ status: "pending", intermediateValue: { step: "signer.eth.steps.signTypedDataLegacy" } }), "TYPED_DATA_UNSUPPORTED"],
      [of({ status: "stopped" }), "LEDGER_SIGNING_CANCELLED"], [NEVER, "LEDGER_TIMEOUT"],
    ]) {
      let cancelled = false;
      await assert.rejects(awaitDeviceAction({ observable, cancel: () => { cancelled = true; } }, 10, true), { code });
      assert.equal(cancelled, true);
    }
    assert.equal(await awaitDeviceAction({ observable: of({ status: "completed", output: "signature" }), cancel: () => assert.fail() }, 10), "signature");
  });
}
