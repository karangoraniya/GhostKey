import "server-only";
import { createPublicClient, http, type Hex } from "viem";
import { sepolia } from "viem/chains";

// One fixed public testnet RPC. No caller-controlled URL, RPC methods, or credentials.
const client = createPublicClient({ chain: sepolia, transport: http("https://rpc.sepolia.org", { retryCount: 0, timeout: 15000, fetchOptions: { redirect: "error" } }) });
export const web3Rpc = {
  chainId: () => client.getChainId(),
  balance: (address: Hex) => client.getBalance({ address, blockTag: "pending" }),
  code: (address: Hex) => client.getCode({ address, blockTag: "pending" }),
  nonce: (address: Hex) => client.getTransactionCount({ address, blockTag: "pending" }),
  baseFee: async () => (await client.getBlock()).baseFeePerGas,
  broadcast: (serializedTransaction: Hex) => client.sendRawTransaction({ serializedTransaction }),
};
