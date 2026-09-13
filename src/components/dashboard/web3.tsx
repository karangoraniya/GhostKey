import { formatEther } from "viem";
import { Card, Identifier, StatusBadge, countdown } from "@/components/ui/primitives";
import type { Web3Dashboard } from "./use-web3";
import type { Dashboard } from "./use-dashboard";
export function Web3Panel({ w, d }: { w: Web3Dashboard; d: Dashboard }) {
  const busy = !!w.busy || !!d.busy;
  return <div className="workspace-stack">
    <Card title="A wallet your agent can use. A key it never receives." subtitle="SEPOLIA TESTNET ONLY · No mainnet, tokens, or contract calls">
      <p className="caption">GhostKey signs inside the backend after checking your permission. This is a software wallet encrypted by Ledger Key Ring; its key is not held inside the physical Ledger.</p>
      <p className="feedback">Disposable test funds only. Generated wallets cannot be exported and are lost when the backend restarts. Never send real funds or import your main wallet.</p>
      <button className="button primary mt-4" disabled={busy || !!w.intent} onClick={() => void w.generate()}>{w.busy === "wallet" ? "Protecting wallet…" : "Create a disposable test wallet"}</button>
      <details className="workspace-disclosure mt-4"><summary>Import a dedicated test wallet instead</summary><form className="mt-4" onSubmit={w.importWallet}>
        <label>Test wallet private key<input type="password" name="privateKey" autoComplete="off" required pattern="0x[a-fA-F0-9]{64}" maxLength={66} /></label>
        <label className="mt-3"><input type="checkbox" required /> This is a disposable test wallet, never used for real funds.</label>
        <button className="button secondary mt-4" disabled={busy || !!w.intent}>Protect test wallet with Key Ring</button>
      </form></details>
      {w.wallet && <div className="mt-4"><label>Wallet<select value={w.wallet.id} disabled={busy || !!w.intent} onChange={e => w.setSelected(e.target.value)}>{w.wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name} · {wallet.address.slice(-8)}</option>)}</select></label><Identifier value={w.wallet.address} label="Sepolia address" /><p className="micro">Fund this public address with a small amount of Sepolia faucet ETH. Key never returned to agent or browser.</p></div>}
    </Card>
    {w.wallet && <Card title="Set the agent’s spending boundary" subtitle="One recipient · 15-minute grant · Amount and total fee-inclusive budget">
      {d.ghosts.length > 0 && <label>Agent<select value={w.agent?.id ?? ""} disabled={busy || !!w.intent} onChange={e => w.setAgentId(e.target.value)}>{d.ghosts.map(g => <option key={g.id} value={g.id}>{g.name} · {g.id.slice(-8)}{d.alive(g.expiresAt) ? "" : " (expired)"}</option>)}</select></label>}
      <button className="button secondary mt-3" disabled={busy || !!w.intent} onClick={() => void d.createGhost()}>Create a new agent</button>
      <form className="mt-4" onSubmit={e => { e.preventDefault(); void w.createGrant(); }}>
        <label>Allowed recipient address<input value={w.recipient} onChange={e => w.setRecipient(e.target.value)} required pattern="0x[a-fA-F0-9]{40}" disabled={busy || !!w.intent} placeholder="0x… ordinary Sepolia wallet" /></label>
        <label className="mt-3">Maximum per transfer (test ETH)<input inputMode="decimal" value={w.maximum} onChange={e => w.setMaximum(e.target.value)} required disabled={busy || !!w.intent} /></label>
        <label className="mt-3">Total budget including fees (test ETH)<input inputMode="decimal" value={w.budget} onChange={e => w.setBudget(e.target.value)} required disabled={busy || !!w.intent} /></label>
        <p className="micro mt-3">Hard limits: 0.001 per transfer, 0.005 per grant. Each transfer reserves up to 0.000525 additional test ETH for fees. Grants do not require a physical button press; requests outside the grant are blocked.</p>
        <button className="button primary mt-4" disabled={busy || !!w.intent || !w.agent || !d.alive(w.agent.expiresAt) || w.wallet.uncertain}>Grant wallet permission</button>
      </form>
      {w.grant && <div className="feedback"><StatusBadge tone={w.active ? "success" : "muted"}>{w.active ? "PERMISSION ACTIVE" : "EXPIRED / DIFFERENT SELECTION"}</StatusBadge><Identifier value={w.grant.capabilityId} label="wallet capability" /><p className="micro">web3.balance.read · web3.transfer · Expires in {countdown(w.grant.expiresAt, d.now)}</p><Identifier value={w.grant.walletId} label="wallet ID" /></div>}
    </Card>}
    {w.grant && <Card title="Let the agent act within its permission" subtitle="The same API is available through MCP. No private-key tool exists.">
      <button className="button secondary" disabled={busy || !w.active} onClick={() => void w.readBalance()}>{w.busy === "balance" ? "Reading…" : "Read Sepolia balance"}</button>
      {w.balance !== undefined && <p className="feedback">Balance: {formatEther(BigInt(w.balance))} test ETH (last read)</p>}
      <p className="caption mt-4">Transfer to the approved recipient:</p><Identifier value={w.grant.recipient} label="approved recipient" />
      <label className="mt-3">Amount to send (test ETH)<input inputMode="decimal" value={w.value} onChange={e => w.setValue(e.target.value)} disabled={busy || !!w.intent} /></label>
      <button className="button primary mt-4" disabled={busy || !w.active || !!w.result || w.wallet?.uncertain} onClick={() => void w.transfer()}>{w.busy === "transfer" ? "Checking policy and submitting…" : w.intent ? "Retry the same transfer request" : "Send test ETH through GhostKey"}</button>
      {w.intent && <p className="micro mt-3">Request: {w.intent.requestId}. On a timeout, keep this page open and retry this same request. Do not create another transfer to retry.</p>}
      {w.result && <div className="feedback" role="status"><StatusBadge tone={w.result.status === "SUBMITTED" ? "success" : "warning"}>{w.result.status}</StatusBadge><p>{w.result.status === "SUBMITTED" ? "Submitted to Sepolia. Await confirmation in the explorer." : "Broadcast outcome is unknown. Wallet locked; inspect the hash before taking any further action."}</p><p>Private key exposed: NO</p><a className="text-link" href={`https://sepolia.etherscan.io/tx/${w.result.transactionHash}`} target="_blank" rel="noreferrer">View transaction on Sepolia →</a></div>}
      <p className="micro mt-4">MCP tools: ghost_web3_balance · ghost_web3_transfer. This UI keeps one transfer intent per page session to avoid accidental duplicates.</p>
    </Card>}
    {w.error && <p className="feedback" role="alert">{w.error}</p>}
    <p className="caption">Higher limits, mainnet, arbitrary signatures, and contract calls are unsupported. The existing Ledger hardware demo does not expand this wallet’s permissions.</p>
  </div>;
}
