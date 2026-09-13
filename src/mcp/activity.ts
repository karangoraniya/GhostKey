import { actions, ghostIdSchema, scopeSchema, safeErrorCode, type ToolName } from "./contracts";

// Only validated IDs/resource names and fixed codes. No bodies, titles, argv, or errors.
export function logActivity(tool: ToolName | undefined, args: unknown, error?: string) {
  const input = args && typeof args === "object" ? args as Record<string, unknown> : {};
  const agent = ghostIdSchema.safeParse(input.ghostId);
  const resource = scopeSchema.pick({ owner: true, repo: true }).safeParse({ owner: input.owner, repo: input.repo });
  process.stderr.write(JSON.stringify({
    ...(agent.success ? { agent: agent.data } : {}),
    action: tool ? actions[tool] : "unknown",
    ...(!error && resource.success ? { resource: `${resource.data.owner}/${resource.data.repo}` } : {}),
    result: error ? "blocked" : "allowed",
    ...(error ? { reason: safeErrorCode(error) } : {}),
  }) + "\n");
}
