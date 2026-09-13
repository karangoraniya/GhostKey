import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { toolSchemas } from "../contracts";
export const web3Tools: Tool[] = [
  { name: "ghost_web3_balance", description: "Read a dedicated agent wallet's Sepolia test-ETH balance using web3.balance.read permission. No private key is returned or needed by the agent.", inputSchema: z.toJSONSchema(toolSchemas.ghost_web3_balance) as Tool["inputSchema"], annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } },
  { name: "ghost_web3_transfer", description: "Submit a real Sepolia test-ETH transfer within an operator-issued web3.transfer capability. Only its fixed recipient, amount limit and fee-inclusive budget are allowed. No mainnet, contracts or arbitrary signing. Use a UUID requestId; retries MUST reuse the same ID and exact inputs. SUBMITTED is not confirmation. UNKNOWN means stop and inspect the transaction hash; never retry with a new ID. Private keys and raw signed transactions are never returned.", inputSchema: z.toJSONSchema(toolSchemas.ghost_web3_transfer) as Tool["inputSchema"], annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true } },
];
