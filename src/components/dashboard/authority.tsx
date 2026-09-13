import { githubActions } from "@/types/broker";
import { Card, EmptyState, Icon, Identifier, StatusBadge, countdown, localTime } from "@/components/ui/primitives";
import type { Dashboard } from "./use-dashboard";

export function AgentPanel({ d }: { d: Dashboard }) {
  return <Card title="Active Agent" subtitle="Ephemeral identity with temporary authority." icon={<Icon name="agent" />} className={`agent-panel ${d.ghost && !d.ghostActive ? "is-expired" : ""}`}
    aside={<StatusBadge tone={d.ghostActive ? "success" : "muted"}>{d.ghost ? d.ghostActive ? "ACTIVE" : "EXPIRED" : "NO IDENTITY"}</StatusBadge>}>
    {d.ghost ? <div className="agent-identity"><div className="agent-avatar"><Icon name="agent" size={26} /></div><div className="min-w-0 flex-1"><h3>{d.ghost.name}</h3><Identifier value={d.ghost.id} label="ghost ID" /></div><div className="countdown-block"><span>EXPIRES IN</span><strong>{countdown(d.ghost.expiresAt, d.now)}</strong></div></div> : <EmptyState title="No active ghost">Create an ephemeral identity to begin.</EmptyState>}
    {d.ghost && <p className="micro mt-3">Created {localTime(d.ghost.createdAt)} · observed this session</p>}
    <form className="inline-form mt-5" onSubmit={e => { e.preventDefault(); void d.createGhost(); }}>
      <label className="flex-1">Agent name<input value={d.name} onChange={e => d.setName(e.target.value)} placeholder="e.g. claude-code" maxLength={100} required /></label>
      <label>TTL (seconds)<input type="number" min={1} max={86400} step={1} required value={Number.isNaN(d.ghostTtl) ? "" : d.ghostTtl} onChange={e => d.setGhostTtl(e.target.valueAsNumber)} /></label>
      <button className="button secondary" disabled={Boolean(d.busy) || !d.name.trim()}>{d.busy === "ghost" ? "Creating…" : d.ghost ? "New identity" : "Create identity"}</button>
    </form>
  </Card>;
}
export function AuthorityPanel({ d }: { d: Dashboard }) {
  return <Card id="authority" title="Authority" subtitle="Grant only what this agent needs." icon={<Icon name="key" />} className="authority-panel" aside={<span className="section-number">01 / POLICY</span>}>
    <form onSubmit={e => { e.preventDefault(); void d.createCap(); }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>Repository owner<input placeholder="darkwebdev2" value={d.owner} onChange={e => d.setOwner(e.target.value)} required pattern={"[A-Za-z0-9\\-]+"} title="Enter an owner name, not a URL" /></label>
        <label>Repository name<input placeholder="ghost-protocol" value={d.repo} onChange={e => d.setRepo(e.target.value)} required pattern={"[A-Za-z0-9_.\\-]+"} title="Enter a repository name, not a URL" /></label>
      </div>
      <p className="micro mt-2">Owner and repository names only. No GitHub URLs.</p>
      <fieldset className="action-picker"><legend>Scope this grant</legend>{githubActions.map(action => <label className="check" key={action}><input type="checkbox" checked={d.actions.includes(action)} onChange={e => d.setActions(e.target.checked ? [...d.actions, action] : d.actions.filter(item => item !== action))} /><code>{action.replace("github.", "")}</code></label>)}</fieldset>
      <div className="flex flex-wrap items-end justify-between gap-3"><label>Capability TTL (seconds)<input type="number" min={1} max={86400} step={1} required value={Number.isNaN(d.capTtl) ? "" : d.capTtl} onChange={e => d.setCapTtl(e.target.valueAsNumber)} /></label><button className="button primary" disabled={Boolean(d.busy) || !d.ghostActive || !d.owner.trim() || !d.repo.trim() || !d.actions.length}>{d.busy === "capability" ? "Granting…" : "Grant capability"}</button></div>
    </form>
    <div className="capability-list">
      {!d.currentCaps.length && <EmptyState title="No capabilities granted">A provider, a resource, an action, and a time limit.</EmptyState>}
      {d.currentCaps.map(cap => {
        const active = d.capActive(cap); const elevated = cap.risk === "HIGH";
        const soon = active && Date.parse(cap.expiresAt) - d.now < 120000;
        return <article className={`capability ${d.selectedCap === cap.id ? "is-selected" : ""} ${active ? "" : "is-expired"}`} key={cap.id}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><Icon name="github" size={16} /><span className="resource">{cap.resource.owner}/{cap.resource.repo}</span></div><StatusBadge tone={!active ? "muted" : soon ? "warning" : elevated ? "neutral" : "success"}>{!active ? "EXPIRED" : soon ? "EXPIRES SOON" : elevated ? "LEDGER VERIFIED" : "ACTIVE"}</StatusBadge></div>
          <Identifier value={cap.id} label="capability ID" />
          <div className="permission-list">{cap.actions.map(action => <div className="permission" key={action}><code>{action}</code><span className={active ? "text-success" : "text-muted"}>{active ? "ALLOWED" : "EXPIRED"}</span></div>)}</div>
          <div className="capability-footer"><span>Created {localTime(cap.createdAt)} · <time dateTime={cap.expiresAt} title={cap.expiresAt}>expires {localTime(cap.expiresAt)}</time></span><strong className="mono">{countdown(cap.expiresAt, d.now)}</strong></div>
          {elevated ? <p className="micro mt-2">HIGH RISK · ledger-hardware-approval · demonstration grant</p> : <label className="check mt-3"><input type="radio" name="selected-capability" checked={d.selectedCap === cap.id} onChange={() => d.setSelectedCap(cap.id)} disabled={!active} />Use for provider demo</label>}
        </article>;
      })}
    </div>
    <div className="policy-boundary"><span className="micro">ENFORCED BOUNDARIES</span><div className="permission"><code>github.repo.delete</code><StatusBadge tone="danger">BLOCKED</StatusBadge></div><div className="permission"><code>github.admin.write</code><StatusBadge>LEDGER REQUIRED</StatusBadge></div></div>
  </Card>;
}
