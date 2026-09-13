import { localRoute } from "@/lib/http/localRoute";
import { approvalService, validateApprovalBinding } from "@/lib/approvals/approvalService";
import { approvalResponse } from "@/lib/approvals/response";
export const runtime = "nodejs";
export const POST = localRoute(async body => approvalResponse(await approvalService.requestApproval(validateApprovalBinding(body))));
