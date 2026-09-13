import { BrokerError } from "@/lib/broker/errors";
import { getAgentWallet } from "./wallets";
import { normalizedAddress, web3Input, web3ResourceSchema, WEB3_MAX_VALUE, WEB3_MAX_BUDGET, WEB3_GAS, WEB3_MAX_FEE } from "./config";
import type { Web3Resource } from "@/types/broker";
export function normalizeWeb3Resource(input: unknown): Web3Resource {
  const resource = web3Input(web3ResourceSchema, input);
  getAgentWallet(resource.walletId);
  if (BigInt(resource.maxValueWei) > WEB3_MAX_VALUE || BigInt(resource.budgetWei) > WEB3_MAX_BUDGET ||
      BigInt(resource.budgetWei) < BigInt(resource.maxValueWei) + WEB3_GAS * WEB3_MAX_FEE) throw new BrokerError("WEB3_LIMIT_EXCEEDED");
  return { ...resource, recipient: normalizedAddress(resource.recipient) };
}
export function validateWeb3Resource(resource: Web3Resource, input: { walletId?: string; chainId?: number; action: string; to?: string; valueWei?: string }) {
  if (input.chainId !== resource.chainId) throw new BrokerError("WEB3_CHAIN_NOT_ALLOWED");
  if (input.walletId !== resource.walletId) throw new BrokerError("RESOURCE_NOT_ALLOWED");
  if (input.action === "web3.transfer") {
    if (!input.to || normalizedAddress(input.to) !== resource.recipient) throw new BrokerError("RESOURCE_NOT_ALLOWED");
    if (!input.valueWei || !/^[1-9][0-9]{0,17}$/.test(input.valueWei) || BigInt(input.valueWei) > BigInt(resource.maxValueWei)) throw new BrokerError("WEB3_LIMIT_EXCEEDED");
  }
}
