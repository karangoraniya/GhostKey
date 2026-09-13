import "server-only";
import { keccak256, parseTransaction, recoverTransactionAddress, type Hex, type TransactionSerialized, type TransactionSerializableEIP1559 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { validateCapability } from "@/lib/capabilities";
import { BrokerError } from "@/lib/broker/errors";
import { getAgentWallet, loadAgentKeyInternally, walletState, type TransferResult } from "./wallets";
import { web3Rpc } from "./rpc";
import { WEB3_CHAIN_ID, WEB3_GAS, WEB3_MAX_FEE, WEB3_PRIORITY_FEE, normalizedAddress, transferSchema, walletScopeSchema, web3Input } from "./config";

type Dependencies = { rpc: typeof web3Rpc; loadKey: typeof loadAgentKeyInternally; sign: (key: Hex, tx: TransactionSerializableEIP1559) => Promise<Hex> };
export function createWeb3Provider(deps: Dependencies) {
  async function balance(raw: unknown) {
    const input = web3Input(walletScopeSchema, raw);
    const policy = { ...input, provider: "web3", action: "web3.balance.read" };
    validateCapability(policy);
    const wallet = getAgentWallet(input.walletId);
    try {
      if (await deps.rpc.chainId() !== WEB3_CHAIN_ID) throw new BrokerError("WEB3_CHAIN_NOT_ALLOWED");
      validateCapability(policy);
      const balanceWei = await deps.rpc.balance(wallet.address);
      validateCapability(policy);
      return { address: wallet.address, chainId: WEB3_CHAIN_ID, balanceWei: balanceWei.toString() };
    } catch (error) { if (error instanceof BrokerError) throw error; throw new BrokerError("WEB3_REQUEST_FAILED", 502); }
  }
  async function transfer(raw: unknown): Promise<TransferResult> {
    const input = web3Input(transferSchema, raw);
    const to = normalizedAddress(input.to);
    const policy = { ...input, to, provider: "web3", action: "web3.transfer" };
    const cap = validateCapability(policy);
    if (cap.provider !== "web3") throw new BrokerError("PROVIDER_NOT_ALLOWED");
    const wallet = getAgentWallet(input.walletId);
    const requestKey = `${wallet.id}:${input.requestId}`;
    const fingerprint = JSON.stringify({ ghostId: input.ghostId, capabilityId: input.capabilityId, to, valueWei: input.valueWei });
    const previous = walletState.requests.get(requestKey);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new BrokerError("WEB3_REQUEST_CONFLICT", 409);
      if (previous.result) return { ...previous.result };
      throw new BrokerError(previous.error ?? "WEB3_WALLET_BUSY", 409);
    }
    if (walletState.uncertain.has(wallet.id)) throw new BrokerError("WEB3_WALLET_UNCERTAIN", 409);
    if (walletState.locks.has(wallet.id)) throw new BrokerError("WEB3_WALLET_BUSY", 409);
    const value = BigInt(input.valueWei), reserved = value + WEB3_GAS * WEB3_MAX_FEE;
    const spent = walletState.spent.get(cap.id) ?? BigInt(0);
    if (spent + reserved > BigInt(cap.resource.budgetWei)) throw new BrokerError("WEB3_BUDGET_EXCEEDED");
    // Synchronous reservation and wallet lock prevent concurrent budget/nonce races.
    walletState.locks.add(wallet.id);
    walletState.spent.set(cap.id, spent + reserved);
    const record: { fingerprint: string; result?: TransferResult; error?: string } = { fingerprint };
    walletState.requests.set(requestKey, record);
    let key: Hex | undefined, signed: Hex | undefined;
    let broadcasting = false;
    try {
      if (await deps.rpc.chainId() !== WEB3_CHAIN_ID) throw new BrokerError("WEB3_CHAIN_NOT_ALLOWED");
      const senderCode = await deps.rpc.code(wallet.address), recipientCode = await deps.rpc.code(to);
      if ((senderCode && senderCode !== "0x") || (recipientCode && recipientCode !== "0x")) throw new BrokerError("WEB3_CONTRACT_NOT_ALLOWED");
      const baseFee = await deps.rpc.baseFee();
      if (baseFee === null || baseFee + WEB3_PRIORITY_FEE > WEB3_MAX_FEE) throw new BrokerError("WEB3_FEE_TOO_HIGH");
      if (await deps.rpc.balance(wallet.address) < reserved) throw new BrokerError("WEB3_INSUFFICIENT_TEST_FUNDS");
      const nonce = Math.max(await deps.rpc.nonce(wallet.address), walletState.nonceFloor.get(wallet.id) ?? 0);
      if (!Number.isSafeInteger(nonce) || nonce < 0) throw new BrokerError("WEB3_REQUEST_FAILED");
      validateCapability(policy);
      key = await deps.loadKey(wallet.id);
      validateCapability(policy);
      const tx: TransactionSerializableEIP1559 = { type: "eip1559", chainId: WEB3_CHAIN_ID, to, value, nonce, gas: WEB3_GAS, maxFeePerGas: WEB3_MAX_FEE, maxPriorityFeePerGas: WEB3_PRIORITY_FEE };
      signed = await deps.sign(key, tx);
      key = undefined;
      const decoded = parseTransaction(signed);
      const signer = await recoverTransactionAddress({ serializedTransaction: signed as TransactionSerialized });
      if (signer.toLowerCase() !== wallet.address.toLowerCase() || decoded.type !== "eip1559" || decoded.chainId !== WEB3_CHAIN_ID ||
          decoded.to?.toLowerCase() !== to.toLowerCase() || decoded.value !== value || decoded.nonce !== nonce || decoded.gas !== WEB3_GAS ||
          decoded.maxFeePerGas !== WEB3_MAX_FEE || decoded.maxPriorityFeePerGas !== WEB3_PRIORITY_FEE || (decoded.data && decoded.data !== "0x") || decoded.accessList?.length) throw new BrokerError("WEB3_SIGNATURE_INVALID");
      validateCapability(policy); // Revocation/expiry during signing must still win.
      const transactionHash = keccak256(signed);
      const result: TransferResult = { status: "UNKNOWN", transactionHash, chainId: WEB3_CHAIN_ID, to, valueWei: value.toString(), reservedWei: reserved.toString() };
      // Once broadcast starts, timeout is ambiguous. Never release budget or retry signing.
      broadcasting = true;
      walletState.nonceFloor.set(wallet.id, nonce + 1);
      try {
        const returned = await deps.rpc.broadcast(signed);
        if (returned.toLowerCase() === transactionHash.toLowerCase()) result.status = "SUBMITTED";
      } catch { /* Return the locally computed hash, not an RPC error or raw transaction. */ }
      if (result.status === "UNKNOWN") walletState.uncertain.add(wallet.id);
      record.result = result;
      return { ...result };
    } catch (error) {
      if (!broadcasting) walletState.spent.set(cap.id, spent);
      const code = error instanceof BrokerError ? error.code : "WEB3_REQUEST_FAILED";
      record.error = code;
      if (error instanceof BrokerError) throw error;
      throw new BrokerError(code, 502);
    } finally { key = undefined; signed = undefined; walletState.locks.delete(wallet.id); }
  }
  return { balance, transfer };
}
const provider = createWeb3Provider({ rpc: web3Rpc, loadKey: loadAgentKeyInternally, sign: (key, tx) => privateKeyToAccount(key).signTransaction(tx) });
export const getAgentBalance = provider.balance;
export const sendAgentTransfer = provider.transfer;
