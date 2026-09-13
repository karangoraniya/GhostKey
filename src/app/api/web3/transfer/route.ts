import { localRoute } from "@/lib/http/localRoute";
import { sendAgentTransfer } from "@/lib/providers/web3/client";
export const runtime = "nodejs";
export const POST = localRoute(body => sendAgentTransfer(body));
