import { localRoute } from "@/lib/http/localRoute";
import { approvalService, validateApprovalBinding } from "@/lib/approvals/approvalService";
import { approvalResponse } from "@/lib/approvals/response";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  // This starts real native Ledger signing; the client cannot submit an approval flag or signature.
  return localRoute(async body => approvalResponse(await approvalService.approveWithLedger(id, validateApprovalBinding(body))))(request);
}
