import { localRoute } from "@/lib/http/localRoute";
import { executeMcpTool } from "@/lib/broker/mcp";
import { BrokerError } from "@/lib/broker/errors";
export const runtime = "nodejs";
// Loopback bridge to the existing process-local broker. No operator setup commands.
export const POST = localRoute(body => {
  if (typeof body.tool !== "string" || Object.keys(body).some(key => key !== "tool" && key !== "args")) throw new BrokerError("INVALID_INPUT", 400);
  return executeMcpTool(body.tool, body.args);
});
