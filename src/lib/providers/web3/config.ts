import { z } from "zod";
import { getAddress } from "viem";
import { BrokerError } from "@/lib/broker/errors";

export const WEB3_CHAIN_ID = 11155111 as const;
export const WEB3_GAS = BigInt("21000");
export const WEB3_MAX_FEE = BigInt("25000000000"); // 25 gwei; fixed maximum, never agent-controlled.
export const WEB3_PRIORITY_FEE = BigInt("1000000000");
export const WEB3_MAX_VALUE = BigInt("1000000000000000"); // 0.001 test ETH per transfer.
export const WEB3_MAX_BUDGET = BigInt("5000000000000000"); // 0.005 test ETH including worst-case fees.
export const web3Actions = ["web3.balance.read", "web3.transfer"] as const;
export const walletIdSchema = z.string().regex(/^wallet_[a-f0-9]{48}$/);
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/).refine(value => BigInt(value) > BigInt(65535));
export const weiSchema = z.string().regex(/^[1-9][0-9]{0,17}$/);
export const web3ResourceSchema = z.object({ walletId: walletIdSchema, chainId: z.literal(WEB3_CHAIN_ID), recipient: addressSchema, maxValueWei: weiSchema, budgetWei: weiSchema }).strict();
export const walletScopeSchema = z.object({ ghostId: z.string().regex(/^ghost_[a-f0-9]{48}$/), capabilityId: z.string().regex(/^cap_[a-f0-9]{64}$/), walletId: walletIdSchema, chainId: z.literal(WEB3_CHAIN_ID) }).strict();
export const transferSchema = walletScopeSchema.extend({ to: addressSchema, valueWei: weiSchema, requestId: z.string().uuid() }).strict();
export const walletCreateSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("generate"), name: z.string().trim().min(1).max(60), testnetOnly: z.literal(true) }).strict(),
  z.object({ mode: z.literal("import"), name: z.string().trim().min(1).max(60), testnetOnly: z.literal(true), privateKey: z.string().regex(/^0x[a-fA-F0-9]{64}$/) }).strict(),
]);
export function web3Input<T>(schema: z.ZodType<T>, input: unknown): T {
  if (input && typeof input === "object" && "chainId" in input && input.chainId !== WEB3_CHAIN_ID) throw new BrokerError("WEB3_CHAIN_NOT_ALLOWED");
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BrokerError("INVALID_INPUT", 400);
  return parsed.data;
}
export function normalizedAddress(value: string) {
  try { return getAddress(value); } catch { throw new BrokerError("INVALID_RESOURCE", 400); }
}
