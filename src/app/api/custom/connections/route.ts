import { localRoute } from "@/lib/http/localRoute";
import { createConnection } from "@/lib/providers/custom/connections";
export const runtime = "nodejs";
export const POST = localRoute(body => createConnection(body));
