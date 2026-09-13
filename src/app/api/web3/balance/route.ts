import { localRoute } from "@/lib/http/localRoute";
import { getAgentBalance } from "@/lib/providers/web3/client";
export const runtime = "nodejs";
export const POST = localRoute(body => getAgentBalance(body));
