import { localRoute } from "@/lib/http/localRoute";
import { listConnections } from "@/lib/providers/custom/connections";
export const runtime = "nodejs";
export const POST = localRoute(() => ({ connections: listConnections() }));
