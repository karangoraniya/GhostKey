import "server-only";
import type { Approval } from "@/types/approval";
type ApprovalStore = { approvals: Map<string, Approval>; nonces: Set<string>; consumedNonces: Set<string> };
export function createApprovalStore(): ApprovalStore { return { approvals: new Map(), nonces: new Set(), consumedNonces: new Set() }; }
const shared = globalThis as typeof globalThis & { ghostkeyApprovals?: ApprovalStore };
export const approvalStore = shared.ghostkeyApprovals ??= createApprovalStore();
