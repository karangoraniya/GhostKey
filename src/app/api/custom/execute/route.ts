import { localRoute } from "@/lib/http/localRoute";
import { executeCustomOperation } from "@/lib/providers/custom/client";
export const runtime = "nodejs";
export const POST = localRoute(body => executeCustomOperation(body));
