"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { parseEther } from "viem";
import { api, type Dashboard } from "./use-dashboard";
import type { Web3Resource } from "@/types/broker";
type Wallet = { id: string; name: string; address: string; chainId: 11155111; uncertain: boolean };
type Grant = Web3Resource & { capabilityId: string; ghostId: string; expiresAt: string };
type Intent = { ghostId: string; capabilityId: string; walletId: string; chainId: 11155111; to: string; valueWei: string; requestId: string };
type Result = { status: "SUBMITTED" | "UNKNOWN"; transactionHash: string; valueWei: string };
const messages: Record<string, string> = {
  WEB3_INSUFFICIENT_TEST_FUNDS: "Fund this address with a small amount of Sepolia faucet ETH, including fees.",
  WEB3_BUDGET_EXCEEDED: "The grant's total budget, including maximum fees, has been used.",
  WEB3_LIMIT_EXCEEDED: "Maximum 0.001 test ETH per transfer and 0.005 total. Budget must also cover up to 0.000525 ETH in fees per transfer.",
  WEB3_WALLET_UNCERTAIN: "A previous broadcast has an unknown outcome. This wallet is locked; inspect its transaction hash.",
  WEB3_WALLET_BUSY: "Another request is in progress. Retry this same request after it finishes.",
  WEB3_CONTRACT_NOT_ALLOWED: "Only ordinary wallet addresses are supported. Contracts and delegated accounts are blocked.",
  WEB3_CHAIN_NOT_ALLOWED: "Only Sepolia (11155111) is supported.",
  WEB3_FEE_TOO_HIGH: "Network fees exceed the fixed fee cap. Try later.",
  RESOURCE_NOT_ALLOWED: "The recipient or wallet does not match the grant.",
  INVALID_INPUT: "Check the address and amounts. Only plain decimal test-ETH amounts are accepted.",
  WEB3_WALLET_NOT_FOUND: "This wallet is unavailable. Wallets clear when the backend restarts.",
};
function amount(value: string) { if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(value)) throw { code: "INVALID_INPUT" }; return parseEther(value).toString(); }
export function useWeb3(d: Dashboard) {
  const [wallets, setWallets] = useState<Wallet[]>([]), [selected, setSelected] = useState("");
  const [agentId, setAgentId] = useState(""), [recipient, setRecipient] = useState("");
  const [maximum, setMaximum] = useState("0.001"), [budget, setBudget] = useState("0.005"), [value, setValue] = useState("0.0001");
  const [grant, setGrant] = useState<Grant>(), [balance, setBalance] = useState<string>(), [result, setResult] = useState<Result>();
  const [intent, setIntent] = useState<Intent>(), [busy, setBusy] = useState(""), [error, setError] = useState("");
  const lock = useRef(false);
  const wallet = wallets.find(w => w.id === selected) ?? wallets[0];
  const agent = d.ghosts.find(g => g.id === agentId) ?? d.ghost;
  const active = !!(grant && agent && wallet && grant.ghostId === agent.id && grant.walletId === wallet.id && d.alive(grant.expiresAt) && d.alive(agent.expiresAt));
  useEffect(() => { void api<{ wallets: Wallet[] }>("web3/wallets/list", {}).then(data => setWallets(data.wallets)).catch(() => setError("Could not load agent wallets.")); }, []);
  async function run(task: string, work: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(task); setError("");
    try { await work(); } catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" && /^[A-Z0-9_]+$/.test(cause.code) ? cause.code : "REQUEST_FAILED";
      setError(`${code}: ${messages[code] ?? "Check Key Ring, your active permission, and the network. For a transfer timeout, retry only the same request."}`);
      d.addEvent({ label: "Agent wallet request did not complete", detail: code, status: "FAILED", tone: "danger" });
    } finally { lock.current = false; setBusy(""); }
  }
  async function save(input: unknown) {
    const data = await api<Wallet>("web3/wallets", input); setWallets(previous => [...previous, data]); setSelected(data.id); setBalance(undefined);
    d.addEvent({ label: "Agent wallet protected", detail: "web3.wallet.created", status: "SEPOLIA", tone: "neutral" });
  }
  function generate() { return run("wallet", () => save({ mode: "generate", name: "agent-wallet", testnetOnly: true })); }
  function importWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    const input = event.currentTarget.elements.namedItem("privateKey") as HTMLInputElement;
    let privateKey = input.value; input.value = "";
    void run("wallet", async () => { try { await save({ mode: "import", name: "imported-test-wallet", testnetOnly: true, privateKey }); } finally { privateKey = ""; } });
  }
  function createGrant() { return run("grant", async () => {
    if (!wallet || !agent || !d.alive(agent.expiresAt)) throw { code: "GHOST_EXPIRED" };
    const resource: Web3Resource = { walletId: wallet.id, chainId: 11155111, recipient: recipient.trim(), maxValueWei: amount(maximum), budgetWei: amount(budget) };
    const data = await api<{ capabilityId: string; expiresAt: string }>("capabilities", { provider: "web3", ghostId: agent.id, ...resource, actions: ["web3.balance.read", "web3.transfer"], ttlSeconds: 900 });
    setGrant({ ...resource, ...data, ghostId: agent.id }); setBalance(undefined);
    d.addEvent({ label: "Scoped wallet permission granted", detail: "capability.created · web3", status: "15 MIN MAX", tone: "success" });
  }); }
  function readBalance() { return run("balance", async () => {
    if (!grant || !active) throw { code: "CAPABILITY_EXPIRED" };
    const data = await api<{ balanceWei: string }>("web3/balance", { ghostId: grant.ghostId, capabilityId: grant.capabilityId, walletId: grant.walletId, chainId: grant.chainId });
    setBalance(data.balanceWei); d.addEvent({ label: "Sepolia balance read", detail: "web3.balance.read", status: "ALLOWED", tone: "success" });
  }); }
  function transfer() { return run("transfer", async () => {
    if (!grant || !active) throw { code: "CAPABILITY_EXPIRED" };
    // Retain this exact intent across a network failure. A new UUID could cause a second transfer.
    const request = intent ?? { ghostId: grant.ghostId, capabilityId: grant.capabilityId, walletId: grant.walletId, chainId: grant.chainId, to: grant.recipient, valueWei: amount(value), requestId: crypto.randomUUID() };
    setIntent(request);
    const data = await api<Result>("web3/transfer", request); setResult(data);
    if (data.status === "UNKNOWN") setWallets(previous => previous.map(w => w.id === request.walletId ? { ...w, uncertain: true } : w));
    d.addEvent({ label: data.status === "SUBMITTED" ? "Sepolia transfer submitted" : "Sepolia broadcast outcome unknown", detail: "web3.transfer", status: data.status, tone: data.status === "SUBMITTED" ? "success" : "warning" });
  }); }
  return { wallets, wallet, setSelected, agent, setAgentId, recipient, setRecipient, maximum, setMaximum, budget, setBudget, value, setValue, grant, active, balance, result, intent, busy, error, generate, importWallet, createGrant, readBalance, transfer };
}
export type Web3Dashboard = ReturnType<typeof useWeb3>;
