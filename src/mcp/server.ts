import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { capabilityTools } from "./tools/capabilities";
import { githubTools } from "./tools/github";
import { toolSchemas, type ToolName } from "./contracts";
import { McpToolError } from "./bridge";
import { logActivity } from "./activity";

type Executor = (tool: ToolName, args: unknown) => Promise<Record<string, unknown>>;
export function createMcpServer(execute: Executor) {
  const server = new Server({ name: "ghostkey", version: "0.3.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...capabilityTools, ...githubTools] }));
  // Validate arguments ourselves to keep schema diagnostics/raw input out of tool errors.
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    const tool = Object.hasOwn(toolSchemas, name) ? name as ToolName : undefined;
    let validatedArgs: unknown;
    try {
      if (!tool) throw new McpToolError("UNKNOWN_TOOL");
      const parsed = toolSchemas[tool].safeParse(args);
      if (!parsed.success) throw new McpToolError("INVALID_INPUT");
      validatedArgs = parsed.data;
      const result = await execute(tool, parsed.data);
      logActivity(tool, parsed.data);
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      const code = error instanceof McpToolError ? error.code : "INTERNAL_ERROR";
      logActivity(tool, validatedArgs, code); // Only schema-validated IDs/resources may be logged.
      const result = { success: false, error: code };
      return { isError: true, content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    }
  });
  return server;
}
