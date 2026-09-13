import { localRoute } from "@/lib/http/localRoute";
import { approvalService, validateApprovalBinding } from "@/lib/approvals/approvalService";
import { approvalResponse } from "@/lib/approvals/response";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return localRoute(body => approvalResponse(approvalService.rejectApproval(id, validateApprovalBinding(body))))(request);
}
