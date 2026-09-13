import { Card, Identifier, StatusBadge, countdown } from "@/components/ui/primitives";
import type { CustomDashboard } from "./use-custom";
import type { Dashboard } from "./use-dashboard";
export function CustomSetup({ c, d }: { c: CustomDashboard; d: Dashboard }) {
  return <Card title="Add a Custom API" subtitle="Connect a service with a bearer token or API-key header.">
    <p className="caption">Choose a service you trust and endpoints documented as read-only. GhostKey will send the credential only to this host. GET requests can still consume the service’s quota.</p>
    <form onSubmit={c.store} className="mt-4">
      <label>Connection name<input name="name" required maxLength={60} placeholder="My project API" /></label>
      <label className="mt-3">HTTPS origin<input name="baseUrl" type="url" required maxLength={512} placeholder="https://api.example.com" /></label>
      <p className="micro mt-2">Origin only. Put /v1 and other paths in operations below.</p>
      <label className="mt-3">Authentication<select name="auth" defaultValue="bearer"><option value="bearer">Bearer token (Authorization)</option><option value="header">API-key header</option></select></label>
      <label className="mt-3">API-key header name (ignored for Bearer)<input name="headerName" defaultValue="X-Api-Key" maxLength={64} /></label>
      <label className="mt-3">API key / token<input name="secret" type="password" autoComplete="off" required maxLength={4096} /></label>
      <label className="mt-3">Allowed GET operations<textarea name="operations" rows={3} required maxLength={12000} placeholder={'projects /v1/projects\nprofile /v1/me'} /></label>
      <p className="micro mt-2">One operation name and exact path per line. No URLs, query parameters, placeholders, or write endpoints.</p>
      <button className="button primary mt-4" disabled={!!c.busy || !!d.busy}>{c.busy === "store" ? "Protecting…" : "Protect and save connection"}</button>
    </form>
    {c.connections.length > 0 && <p className="feedback" role="status">{c.connections.length} protected connection(s). Open Custom APIs to grant access and run an operation.</p>}
    {c.error && <p className="feedback" role="alert">{c.error}</p>}
  </Card>;
}
export function CustomPanel({ c, d }: { c: CustomDashboard; d: Dashboard }) {
  const busy = !!c.busy || !!d.busy;
  return <Card title="Run a Custom API operation" subtitle="Your agent gets permission to a named operation, never the key.">
    {!c.connection ? <p className="caption">Add your first Custom API under Connections.</p> : <>
      <label>Connection<select value={c.connection.id} onChange={e => c.setSelected(e.target.value)} disabled={busy}>{c.connections.map(connection => <option value={connection.id} key={connection.id}>{connection.name}</option>)}</select></label>
      <p className="caption mt-3">{c.connection.baseUrl} · Credential protected (connection not pre-tested)</p>
      <label className="mt-3">Operation<select value={c.operation?.name ?? ""} onChange={e => c.setOperationName(e.target.value)} disabled={busy}>{c.connection.operations.map(op => <option key={op.name} value={op.name}>{op.name} — GET {op.path}</option>)}</select></label>
      {d.ghosts.length > 0 && <label className="mt-3">Agent<select value={c.agent?.id ?? ""} onChange={e => c.setAgentId(e.target.value)} disabled={busy}>{d.ghosts.map(agent => <option key={agent.id} value={agent.id}>{agent.name} · {agent.id.slice(-8)}{d.alive(agent.expiresAt) ? "" : " (expired)"}</option>)}</select></label>}
      <div className="buttons mt-4"><button className="button secondary" disabled={busy} onClick={() => void d.createGhost()}>Create a new agent</button><button className="button primary" disabled={busy || !c.agent || !d.alive(c.agent.expiresAt)} onClick={() => void c.createGrant()}>{c.busy === "grant" ? "Granting…" : "Allow this operation for 15 minutes"}</button></div>
      {c.grant && c.active && <div className="feedback"><StatusBadge tone="success">PERMISSION ACTIVE</StatusBadge><Identifier value={c.grant.capabilityId} label="custom capability" /><p>Expires in {countdown(c.grant.expiresAt, d.now)}</p></div>}
      {c.grant && !c.active && <p className="caption mt-3">Grant permission for the current selection before running. Previous permissions may have expired.</p>}
      <button className="button primary mt-4" disabled={busy || !c.active} onClick={() => void c.execute()}>{c.busy === "execute" ? "Calling API…" : "Run operation"}</button>
      {c.result && c.active && <div className="feedback" role="status"><strong>Operation completed · Credential exposed: NO</strong><pre className="aws-text">{JSON.stringify(c.result.data, null, 2)}</pre></div>}
      <p className="micro mt-4">MCP: ghost_custom_read · use this connection ID and the capability ID.</p><Identifier value={c.connection.id} label="connection ID" />
    </>}
    {c.error && <p className="feedback" role="alert">{c.error}</p>}
  </Card>;
}
