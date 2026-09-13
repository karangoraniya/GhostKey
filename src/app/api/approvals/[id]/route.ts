import { approvalService } from "@/lib/approvals/approvalService";
import { approvalResponse } from "@/lib/approvals/response";
import { BrokerError } from "@/lib/broker/errors";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const headers = { "Cache-Control": "no-store" };
  try { return Response.json(approvalResponse(approvalService.getApproval(id)), { headers }); }
  catch (error) { return Response.json({ success: false, error: error instanceof BrokerError ? error.code : "INTERNAL_ERROR" },
    { status: error instanceof BrokerError ? error.status : 500, headers }); }
}
