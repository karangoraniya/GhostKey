import { z } from "zod";
import { walletScopeSchema, transferSchema, web3ResourceSchema, web3Actions } from "@/lib/providers/web3/config";

export const ghostIdSchema = z.string().regex(/^ghost_[a-f0-9]{48}$/);
export const scopeSchema = z.object({
  ghostId: ghostIdSchema,
  capabilityId: z.string().regex(/^cap_[a-f0-9]{64}$/),
  owner: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/),
  repo: z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/).refine(value => value !== "." && value !== ".."),
}).strict();
export const customScopeSchema = z.object({ ghostId: ghostIdSchema, capabilityId: scopeSchema.shape.capabilityId, connectionId: z.string().regex(/^api_[a-f0-9]{48}$/), operation: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/) }).strict();
export const toolSchemas = {
  ghost_web3_balance: walletScopeSchema,
  ghost_web3_transfer: transferSchema,
  ghost_custom_read: customScopeSchema,
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
  ghost_web3_balance: "web3.balance.read",
  ghost_web3_transfer: "web3.transfer",
  ghost_custom_read: "custom.read",
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
  ghost_web3_balance: z.object({ address: z.string().regex(/^0x[a-fA-F0-9]{40}$/), chainId: z.literal(11155111), balanceWei: z.string().regex(/^[0-9]+$/) }),
  ghost_web3_transfer: z.object({ status: z.enum(["SUBMITTED", "UNKNOWN"]), transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/), chainId: z.literal(11155111), to: z.string().regex(/^0x[a-fA-F0-9]{40}$/), valueWei: z.string().regex(/^[0-9]+$/), reservedWei: z.string().regex(/^[0-9]+$/) }),
  ghost_custom_read: z.object({ operation: customScopeSchema.shape.operation, data: z.unknown() }),
  ghost_capabilities: z.object({ capabilities: z.array(z.union([z.object({ capabilityId: scopeSchema.shape.capabilityId, provider: z.literal("web3"), resource: web3ResourceSchema, actions: z.array(z.enum(web3Actions)), expiresAt: z.string().datetime() }), metadata, z.object({ capabilityId: scopeSchema.shape.capabilityId, provider: z.literal("custom"), resource: z.object({ connectionId: customScopeSchema.shape.connectionId }), actions: z.array(z.string().regex(/^custom\.read\.[a-z][a-z0-9_-]{0,39}$/)), expiresAt: z.string().datetime() }), z.object({ capabilityId: scopeSchema.shape.capabilityId, provider: z.literal("aws"), resource: z.object({ service: z.literal("s3"), bucket: z.string() }), actions: z.array(z.enum(["aws.s3.list", "aws.s3.read"])), expiresAt: z.string().datetime() })])) }),
  ghost_github_read_repo: z.object({ name: z.string(), description: z.string().nullable(), private: z.boolean(), defaultBranch: z.string() }),
  ghost_github_create_issue: z.object({ number: z.number().int().positive(), title: z.string(), state: z.enum(["open", "closed"]) }),
  ghost_demo_forbidden_action: z.never(),
};
export const errorCodes = [
  "WEB3_CHAIN_NOT_ALLOWED", "WEB3_WALLET_NOT_FOUND", "WEB3_LIMIT_EXCEEDED", "WEB3_BUDGET_EXCEEDED", "WEB3_REQUEST_CONFLICT", "WEB3_WALLET_BUSY", "WEB3_WALLET_UNCERTAIN", "WEB3_CONTRACT_NOT_ALLOWED", "WEB3_FEE_TOO_HIGH", "WEB3_INSUFFICIENT_TEST_FUNDS", "WEB3_SIGNATURE_INVALID", "WEB3_REQUEST_FAILED", "WEB3_INVALID_KEY",
  "CUSTOM_NOT_CONFIGURED", "CUSTOM_URL_NOT_ALLOWED", "CUSTOM_REQUEST_FAILED", "CUSTOM_REDIRECT_BLOCKED", "CUSTOM_AUTH_FAILED", "CUSTOM_NOT_JSON", "CUSTOM_RESPONSE_TOO_LARGE", "CUSTOM_UNSAFE_RESPONSE",
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
