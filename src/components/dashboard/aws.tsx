import { Card, Identifier, StatusBadge, countdown } from "@/components/ui/primitives";
import type { Dashboard } from "./use-dashboard";
import type { AwsDashboard } from "./use-aws";

export function AwsPanel({ a, d }: { a: AwsDashboard; d: Dashboard }) {
  const disabled = !!a.busy || !!d.busy;
  return <Card title="AWS S3 Demo" subtitle="Provider #2 · the same agent, a different boundary." aside={<StatusBadge tone={a.status?.verifiedAt ? "success" : "muted"}>{a.status?.verifiedAt ? "CONNECTED" : a.status?.configured ? "CONFIGURED" : "NOT CONFIGURED"}</StatusBadge>}>
    <p className="caption">Read-only cloud access. Region: <code>{a.status?.region ?? "Not configured"}</code></p>
    {!a.status?.configured && <p className="caption mt-3">Operator setup: expand Advanced Controls → AWS Configuration. Use a dedicated read-only credential and one demo bucket.</p>}
    <div className="mt-4">{a.agent ? <Identifier value={a.agent.id} label="shared agent ID" /> : <p className="caption">Create Agent in stage 01 first.</p>}</div>
    <label className="mt-4">Demo bucket<input value={a.bucket} onChange={e => a.setBucket(e.target.value)} disabled={disabled} placeholder="Your existing S3 bucket name" maxLength={63} /></label>
    <button className="button secondary mt-3" disabled={disabled || !a.agent || !d.alive(a.agent.expiresAt) || !a.bucket.trim()} onClick={() => void a.create()}>{a.busy === "grant" ? "Granting…" : "Create scoped AWS capability"}</button>
    {a.grant && a.grant.ghostId === a.agent?.id && <div className="feedback"><Identifier value={a.grant.capabilityId} label="AWS capability" /><p><code>aws.s3.list · aws.s3.read</code></p><p>Bucket: {a.grant.bucket} · Expires: {countdown(a.grant.expiresAt, d.now)}</p><StatusBadge tone={a.active ? "success" : "muted"}>{a.active ? "ACTIVE" : "INACTIVE"}</StatusBadge></div>}
    <label className="mt-4">List prefix (optional filter)<input value={a.prefix} onChange={e => a.setPrefix(e.target.value)} placeholder="demo/" maxLength={1024} disabled={disabled} /></label>
    <button className="button primary mt-3" disabled={disabled || !a.active || !a.status?.configured} onClick={() => void a.execute("list")}>{a.busy === "list" ? "Listing…" : "List Objects"}</button>
    {a.active && a.listing && <div className="feedback" role="status"><strong>{a.listing.objects.length} objects returned</strong>{a.listing.truncated && <p>First 100 only. Narrow the prefix to find other objects.</p>}<ul className="aws-objects">{a.listing.objects.map(item => <li key={item.key}><button className="text-link" onClick={() => a.setKey(item.key)}>{item.key}</button><span className="micro">{item.size} bytes</span></li>)}</ul></div>}
    <label className="mt-4">Text object key<input value={a.key} onChange={e => a.setKey(e.target.value)} placeholder="demo/hello.txt" maxLength={1024} disabled={disabled} /></label>
    <p className="micro mt-2">UTF-8 text only, at most 1 MiB. Object contents are displayed as text.</p>
    <button className="button secondary mt-3" disabled={disabled || !a.active || !a.status?.configured || !a.key} onClick={() => void a.execute("read")}>{a.busy === "read" ? "Reading…" : "Read Object"}</button>
    {a.active && a.object && <div className="feedback feedback-success" role="status"><strong>Authorized read · {a.object.size} bytes</strong><p>Credential exposed: NO</p><pre className="aws-text">{a.object.text}</pre></div>}
    <div className="forbidden-demo"><button className="button danger" disabled={disabled || !a.active} onClick={() => void a.execute("demo-blocked")}>Test Forbidden Delete</button>{a.active && a.blocked && <div className="blocked-result" role="status"><StatusBadge tone="danger">BLOCKED</StatusBadge><code>ACTION_NOT_ALLOWED</code><p>AWS request sent: NO · Credential exposed: NO</p><p>Outside agent capability.</p></div>}</div>
    {a.error && <p className="feedback" role="alert">{a.error}</p>}
    <div className="demo-scope"><strong>One Agent. Two Providers. Zero Secrets.</strong><p className="caption">One identity. Multiple providers. Zero permanent credentials exposed.</p><p>GitHub: {d.demoUsable ? "repo.read · issue.create" : "No active demo grant"}</p><p>AWS: {a.active ? "s3.list · s3.read" : "No active demo grant"}</p></div>
  </Card>;
}
export function AwsConfiguration({ a, d }: { a: AwsDashboard; d: Dashboard }) {
  return <Card title="AWS Configuration" subtitle="Local operator setup · encrypted process memory only.">
    <p className="caption">Use a dedicated IAM credential with ListBucket and GetObject for one bucket. Never use root credentials. Restarting the backend clears this configuration.</p>
    <form onSubmit={a.store} className="mt-4">
      <label>Region<input name="region" placeholder="Bucket region, e.g. eu-west-1" maxLength={40} /></label>
      <p className="micro">Leave region empty only when AWS_REGION is set on the backend.</p>
      <label className="mt-3">Access Key ID<input name="accessKeyId" type="password" autoComplete="off" required maxLength={128} /></label>
      <label className="mt-3">Secret Access Key<input name="secretAccessKey" type="password" autoComplete="off" required maxLength={4096} /></label>
      <label className="mt-3">Session Token (optional)<input name="sessionToken" type="password" autoComplete="off" maxLength={4096} /></label>
      <button className="button secondary mt-3" disabled={!!a.busy || !!d.busy}>{a.busy === "store" ? "Protecting…" : "Protect with Ledger"}</button>
    </form><button className="text-link mt-3" disabled={!!a.busy} onClick={() => void a.refresh()}>Refresh AWS status</button>
    <p className="micro mt-3">{a.status?.configured ? "CONFIGURED" : "NOT CONFIGURED"} · {a.status?.region ?? "No region"}. Connected means an S3 action has succeeded with this stored configuration.</p>
    {a.error && <p role="alert" className="feedback">{a.error}</p>}
  </Card>;
}
