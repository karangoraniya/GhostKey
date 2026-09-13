import "server-only";
type EventName = "approval.requested" | "approval.ledger_started" | "approval.approved" | "approval.rejected" | "approval.expired" | "approval.failed" | "capability.elevated" | "capability.expired";
export type ApprovalEvent = { event: EventName; approvalId: string; at: string };
const shared = globalThis as typeof globalThis & { ghostkeyApprovalEvents?: ApprovalEvent[] };
const events = shared.ghostkeyApprovalEvents ??= [];
export function approvalEvent(event: EventName, approvalId: string) {
  if (events.some(item => item.event === event && item.approvalId === approvalId)) return;
  const entry = { event, approvalId, at: new Date(Date.now()).toISOString() };
  events.push(entry);
  if (events.length > 200) events.shift();
  process.stderr.write(JSON.stringify(entry) + "\n");
}
export function approvalEvents(approvalId: string) { return events.filter(event => event.approvalId === approvalId).map(event => ({ ...event })); }
