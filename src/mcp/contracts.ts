import { z } from "zod";

export const ghostIdSchema = z.string().regex(/^ghost_[a-f0-9]{48}$/);
export const scopeSchema = z.object({
  ghostId: ghostIdSchema,
  capabilityId: z.string().regex(/^cap_[a-f0-9]{64}$/),
  owner: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/),
  repo: z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/).refine(value => value !== "." && value !== ".."),
}).strict();
export const toolSchemas = {
  ghost_capabilities: z.object({ ghostId: ghostIdSchema }).strict(),
  ghost_github_read_repo: scopeSchema,
  ghost_github_create_issue: scopeSchema.extend({
    title: z.string().min(1).max(256).refine(value => !!value.trim()),
    body: z.string().max(10000).optional(),
  }).strict(),
  ghost_demo_forbidden_action: scopeSchema,
};
export type ToolName = keyof typeof toolSchemas;
export const toolNames = Object.keys(toolSchemas) as ToolName[];
export const actions: Record<ToolName, string> = {
  ghost_capabilities: "capabilities.list",
  ghost_github_read_repo: "github.repo.read",
  ghost_github_create_issue: "github.issue.create",
  ghost_demo_forbidden_action: "github.repo.delete",
};
const metadata = z.object({
  capabilityId: scopeSchema.shape.capabilityId, provider: z.literal("github"),
  resource: z.object({ owner: scopeSchema.shape.owner, repo: scopeSchema.shape.repo }),
  actions: z.array(z.enum(["github.repo.read", "github.issue.create", "github.admin.write"])),
  expiresAt: z.string().datetime(),
});
export const outputSchemas = {
  ghost_capabilities: z.object({ capabilities: z.array(z.union([metadata, z.object({ capabilityId: scopeSchema.shape.capabilityId, provider: z.literal("aws"), resource: z.object({ service: z.literal("s3"), bucket: z.string() }), actions: z.array(z.enum(["aws.s3.list", "aws.s3.read"])), expiresAt: z.string().datetime() })])) }),
  ghost_github_read_repo: z.object({ name: z.string(), description: z.string().nullable(), private: z.boolean(), defaultBranch: z.string() }),
  ghost_github_create_issue: z.object({ number: z.number().int().positive(), title: z.string(), state: z.enum(["open", "closed"]) }),
  ghost_demo_forbidden_action: z.never(),
};
export const errorCodes = [
  "INVALID_INPUT", "UNKNOWN_TOOL", "GHOST_NOT_FOUND", "GHOST_EXPIRED", "GHOST_MISMATCH",
  "CAPABILITY_NOT_FOUND", "CAPABILITY_EXPIRED", "CAPABILITY_REVOKED", "ACTION_NOT_ALLOWED",
  "RESOURCE_NOT_ALLOWED", "PROVIDER_NOT_ALLOWED", "INVALID_RESOURCE", "CREDENTIAL_NOT_CONFIGURED",
  "CLI_NOT_INSTALLED", "KEYRING_NOT_INITIALIZED", "PASSWORD_REQUIRED", "ENCRYPTION_FAILED", "DECRYPTION_FAILED",
  "GITHUB_UNAUTHORIZED", "GITHUB_FORBIDDEN", "GITHUB_NOT_FOUND", "GITHUB_REQUEST_FAILED", "GITHUB_INVALID_RESPONSE",
  "BROKER_UNAVAILABLE", "BROKER_INVALID_RESPONSE", "LOCAL_ONLY", "ORIGIN_NOT_ALLOWED", "INTERNAL_ERROR",
] as const;
export type ErrorCode = typeof errorCodes[number];
export function safeErrorCode(value: unknown): ErrorCode {
  return errorCodes.includes(value as ErrorCode) ? value as ErrorCode : "INTERNAL_ERROR";
}
