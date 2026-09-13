import "server-only";
import { randomBytes } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { encryptSecret, decryptSecret } from "@/lib/ledger/keyring";
import { BrokerError } from "@/lib/broker/errors";
import { WEB3_CHAIN_ID, walletCreateSchema, web3Input } from "./config";

type Wallet = { id: string; name: string; address: Hex; chainId: typeof WEB3_CHAIN_ID; encrypted: string; createdAt: string };
export type TransferResult = { status: "SUBMITTED" | "UNKNOWN"; transactionHash: Hex; chainId: typeof WEB3_CHAIN_ID; valueWei: string; to: Hex; reservedWei: string };
type RequestRecord = { fingerprint: string; result?: TransferResult; error?: string };
type WalletState = { wallets: Map<string, Wallet>; locks: Set<string>; spent: Map<string, bigint>; requests: Map<string, RequestRecord>; nonceFloor: Map<string, number>; uncertain: Set<string> };
const memory = globalThis as typeof globalThis & { ghostkeyWeb3?: WalletState };
export const walletState: WalletState = memory.ghostkeyWeb3 ??= { wallets: new Map(), locks: new Set(), spent: new Map(), requests: new Map(), nonceFloor: new Map(), uncertain: new Set() };
function metadata(wallet: Wallet) { return { id: wallet.id, name: wallet.name, address: wallet.address, chainId: wallet.chainId, createdAt: wallet.createdAt, uncertain: walletState.uncertain.has(wallet.id) }; }
export function listAgentWallets() { return [...walletState.wallets.values()].map(metadata); }
export function getAgentWallet(id: string) {
  const wallet = walletState.wallets.get(id);
  if (!wallet) throw new BrokerError("WEB3_WALLET_NOT_FOUND", 404);
  return metadata(wallet);
}
export async function createAgentWallet(raw: unknown) {
  const input = web3Input(walletCreateSchema, raw);
  if (walletState.wallets.size >= 10) throw new BrokerError("WEB3_WALLET_LIMIT", 409);
  let key: Hex | undefined = input.mode === "generate" ? generatePrivateKey() : input.privateKey as Hex;
  try {
    let address: Hex;
    try { address = privateKeyToAccount(key).address; } catch { throw new BrokerError("WEB3_INVALID_KEY", 400); }
    // Disallow duplicate signers: all nonce/budget concurrency is serialized per wallet.
    if ([...walletState.wallets.values()].some(wallet => wallet.address === address)) throw new BrokerError("WEB3_WALLET_EXISTS", 409);
    const id = `wallet_${randomBytes(24).toString("hex")}`;
    const encrypted = await encryptSecret({ value: key, keyName: `web3-${id.slice(7)}` });
    if (walletState.wallets.size >= 10 || [...walletState.wallets.values()].some(wallet => wallet.address === address)) throw new BrokerError("WEB3_WALLET_EXISTS", 409);
    const wallet: Wallet = { id, name: input.name, address, chainId: WEB3_CHAIN_ID, encrypted, createdAt: new Date().toISOString() };
    walletState.wallets.set(id, wallet);
    return metadata(wallet); // Never return private key, mnemonic, or ciphertext.
  } finally { key = undefined; }
}
// Only called inside the provider after authorization. This is a software-wallet key.
export async function loadAgentKeyInternally(id: string): Promise<Hex> {
  const wallet = walletState.wallets.get(id);
  if (!wallet) throw new BrokerError("WEB3_WALLET_NOT_FOUND", 404);
  const key = await decryptSecret({ encrypted: wallet.encrypted, keyName: `web3-${id.slice(7)}` });
  if (!/^0x[a-fA-F0-9]{64}$/.test(key)) throw new BrokerError("WEB3_INVALID_KEY");
  return key as Hex;
}
