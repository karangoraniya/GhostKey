import "server-only";
import { listGhostCapabilities, validateCapability } from "@/lib/capabilities";
import { getRepository, createIssue } from "@/lib/providers/github/client";
import { BrokerError } from "./errors";
import { toolSchemas, type ToolName } from "@/mcp/contracts";

// Transport-independent dispatch: the model cannot select a provider action or URL.
export async function executeMcpTool(tool: string, input: unknown) {
  if (!Object.hasOwn(toolSchemas, tool)) throw new BrokerError("UNKNOWN_TOOL", 400);
  const parsed = toolSchemas[tool as ToolName].safeParse(input);
  if (!parsed.success) throw new BrokerError("INVALID_INPUT", 400);
  if (tool === "ghost_capabilities") return { capabilities: listGhostCapabilities(parsed.data.ghostId) };
  // Narrow with the corresponding schema; never cast arbitrary model data into provider inputs.
  if (tool === "ghost_github_read_repo") return getRepository(toolSchemas.ghost_github_read_repo.parse(parsed.data));
  if (tool === "ghost_github_create_issue") return createIssue(toolSchemas.ghost_github_create_issue.parse(parsed.data));
  const scope = toolSchemas.ghost_demo_forbidden_action.parse(parsed.data);
  validateCapability({ ...scope, provider: "github", action: "github.repo.delete" });
  // No deletion implementation exists, even if policy is extended in a future milestone.
  throw new BrokerError("ACTION_NOT_ALLOWED");
}
