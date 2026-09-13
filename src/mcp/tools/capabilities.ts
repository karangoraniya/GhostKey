import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { toolSchemas } from "../contracts";

export const capabilityTools: Tool[] = [{
  name: "ghost_capabilities",
  description: "List active capabilities for your supplied GhostKey ghost identity. Returns scoped grants only, never credentials. Obtain the ghost ID from the local operator.",
  inputSchema: z.toJSONSchema(toolSchemas.ghost_capabilities) as Tool["inputSchema"],
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}];
