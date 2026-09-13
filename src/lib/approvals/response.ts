import type { approvalService } from "./approvalService";

// Explicit public projection: no nonce, signature, or internal store fields.
export function approvalResponse(value: ReturnType<typeof approvalService.getApproval>) {
  return { approvalId: value.id, ghostId: value.ghostId, requestedAction: value.requestedAction,
    resource: value.resource, risk: value.risk, status: value.status, expiresAt: value.expiresAt,
    walletAddress: value.walletAddress, approvedAt: value.approvedAt, signing: value.signing,
    error: value.error, capability: value.capability, events: value.events };
}
export type ApprovalResponse = ReturnType<typeof approvalResponse>;
