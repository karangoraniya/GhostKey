import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { toolSchemas } from "../contracts";

export const githubTools: Tool[] = [
  {
    name: "ghost_github_read_repo",
    description: "Read repository metadata using a github.repo.read capability belonging to ghostId. Supply owner/repo names, not URLs. Never returns credentials.",
    inputSchema: z.toJSONSchema(toolSchemas.ghost_github_read_repo) as Tool["inputSchema"],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "ghost_github_create_issue",
    description: "Create a real GitHub issue using a github.issue.create capability belonging to ghostId. Supply owner/repo names. Do not retry an ambiguous timeout without checking GitHub for a created issue.",
    inputSchema: z.toJSONSchema(toolSchemas.ghost_github_create_issue) as Tool["inputSchema"],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "ghost_demo_forbidden_action",
    description: "Policy-only demo: attempt github.repo.delete authorization. An active matching grant is rejected with ACTION_NOT_ALLOWED. Never loads a credential or sends a GitHub request; deletion is not implemented.",
    inputSchema: z.toJSONSchema(toolSchemas.ghost_demo_forbidden_action) as Tool["inputSchema"],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];
