import { Card, Icon, Identifier, StatusBadge, countdown, localTime, EmptyState, type Tone } from "@/components/ui/primitives";
import { DEMO_RESOURCE, explain, type Dashboard } from "./use-dashboard";

// Shared status vocabulary: every "is this ready" badge across the header, the
// Trust panel, and the disclosure summary reads from the same three words.
export function ringStatus(d: Dashboard): { label: string; tone: Tone } {
  if (!d.ring) return { label: "CHECKING", tone: "muted" };
  if (d.ring.status === "connected") return { label: "READY", tone: "success" };
  if (d.ring.status === "error") return { label: "ERROR", tone: "danger" };
  return { label: "NOT CONFIGURED", tone: "muted" };
}
export function hardwareStatus(d: Dashboard, signing: boolean): { label: string; tone: Tone } {
  if (signing) return { label: "IN USE", tone: "warning" };
  if (!d.device) return { label: "CHECKING", tone: "muted" };
  switch (d.device.status) {
    case "READY": return { label: "READY", tone: "success" };
    case "BUSY": return { label: "BUSY", tone: "warning" };
    case "ERROR": return { label: "ERROR", tone: "danger" };
    case "ETHEREUM_APP_REQUIRED": return { label: "APP REQUIRED", tone: "muted" };
    default: return { label: "NOT CONNECTED", tone: "muted" };
  }
}
export function ledgerTrust(d: Dashboard): { ready: boolean; checking: boolean; label: string; tone: Tone } {
  const ready = d.device?.status === "READY" && d.ring?.status === "connected";
  const checking = !d.device || !d.ring;
  return { ready, checking, label: ready ? "READY" : checking ? "CHECKING" : "NOT READY", tone: ready ? "success" : "muted" };
}

export function TrustPanel({ d, compact = false }: { d: Dashboard; compact?: boolean }) {
  const trust = ledgerTrust(d);
  const deviceReady = d.device?.status === "READY";
  const signing = Boolean(d.busy === "ledger" || d.approval?.signing);
  const ring = ringStatus(d);
  const hardware = hardwareStatus(d, signing);
  return <Card id={compact ? undefined : "trust"} title="Ledger Trust" icon={<Icon name="ledger" />} className={`trust-panel ${compact ? "compact-trust" : ""}`} aside={<span className="section-number">HARDWARE ROOT</span>}>
    {!compact && <div className="trust-emblem"><Icon name="ledger" size={34} /><div><h3>A physical trust boundary.</h3><p>Secrets stay protected. High-risk authority requires hardware confirmation.</p></div></div>}
    <dl className="trust-facts">
      <div><dt>Key Ring</dt><dd><StatusBadge tone={ring.tone}>{ring.label}</StatusBadge></dd></div>
      <div><dt>Hardware</dt><dd><StatusBadge tone={hardware.tone}>{hardware.label}</StatusBadge></dd></div>
      <div><dt>Ethereum app</dt><dd><StatusBadge tone={d.device?.ethereumAppReady ? "success" : "muted"}>{d.device?.ethereumAppReady ? "READY" : "NOT VERIFIED"}</StatusBadge></dd></div>
      <div><dt>Human approval</dt><dd><StatusBadge tone={deviceReady ? "success" : "muted"}>{deviceReady ? "AVAILABLE" : "DEVICE REQUIRED"}</StatusBadge></dd></div>
    </dl>
    {d.device?.address && <div className="mt-4"><span className="micro">SIGNER · ETHEREUM</span><Identifier value={d.device.address} label="signer address" /></div>}
    {!trust.ready && <p className="caption mt-4">{d.device?.error ? explain(d.device.error) : "Connect and unlock your Ledger, then open Ethereum."}</p>}
    <div className="buttons mt-5"><button className="button secondary" disabled={Boolean(d.busy) || signing} onClick={() => void d.refreshTrust()}>{d.busy === "trust" ? "Checking…" : "Refresh status"}</button>{!compact && <button className="button quiet" disabled={Boolean(d.busy)} onClick={() => void d.testRing()}>{d.busy === "ring" ? "Testing…" : "Test Key Ring"}</button>}</div>
    <p className="micro mt-3">{d.deviceChecked ? `Hardware checked ${localTime(d.deviceChecked)} · refresh after reconnecting` : "Hardware connection has not been verified."}</p>
    {d.ringVerified && <p className="caption mt-2 text-success" role="status">✓ Fake-secret round-trip verified</p>}
  </Card>;
}
export function ApprovalPanel({ d, demo = false }: { d: Dashboard; demo?: boolean }) {
  const a = demo ? d.demoApproval : d.approval;
  const agent = demo ? d.demoGhost : d.ghost;
  const resource = demo ? `${DEMO_RESOURCE.owner}/${DEMO_RESOURCE.repo}` : d.owner && d.repo ? `${d.owner}/${d.repo}` : "Set a repository in Authority";
  const expired = Boolean(a && !d.alive(a.expiresAt));
  const pending = a?.status === "PENDING" && !expired;
  const signing = Boolean(a && (d.signingApprovalId === a.approvalId || a.signing));
  const elevatedActive = Boolean(a?.capability && d.capActive(a.capability));
  const ghostActive = Boolean(a && d.activeGhostIds.has(a.ghostId));
  // Re-locks if the underlying demo grant has since expired, even if the boundary test
  // succeeded earlier in this session — a stale "unlocked" state would let a doomed
  // request through instead of pointing back at stage 01.
  const demoReady = Boolean(d.demoBlocked && d.demoUsable);
  const locked = demo && !a && !demoReady;
  return <Card id={demo ? "demo-approve" : undefined} title={demo ? "High-Risk Authority" : "Advanced Approval"} subtitle="This action exceeds the agent’s current authority." icon={demo ? <span className="stage-number">03</span> : <Icon name="shield" />} className={`approval-panel ${demo ? "demo-approval" : ""} ${locked ? "stage-locked" : ""}`} aside={<StatusBadge tone="warning">HIGH RISK</StatusBadge>}>
    {locked && <div className="lock-banner"><Icon name="shield" size={13} />Locked — {!d.demoUsable ? "create an agent in stage 01" : "complete the boundary test in stage 02"} first</div>}
    <div className={locked ? "stage-dimmed" : ""}>
    {!a && !demo && <EmptyState title="No pending approval">Request authority beyond the agent’s current scope.</EmptyState>}
    <dl className="request-facts"><div><dt>Agent</dt><dd>{a ? <Identifier value={a.ghostId} label="approval ghost ID" /> : agent ? <Identifier value={agent.id} label="ghost ID" /> : "No identity selected"}</dd></div><div><dt>Requested action</dt><dd><code>github.admin.write</code></dd></div><div><dt>Resource</dt><dd className="mono break-anywhere">{a?.resource ?? resource}</dd></div></dl>
    {pending && !signing && <div className="approval-state"><div className="flex items-center justify-between gap-2"><StatusBadge tone="warning">HUMAN APPROVAL REQUIRED</StatusBadge><code>{countdown(a.expiresAt, d.now)}</code></div><p>Review this exact scope on your Ledger before approving.</p></div>}
    {signing && <div className="approval-state" role="status"><StatusBadge tone="warning" pulse>WAITING FOR LEDGER</StatusBadge><p>Review and physically confirm on your Ledger device.</p></div>}
    {a?.status === "APPROVED" && <div className="verified-state" role="status"><div className="flex items-center gap-2"><Icon name="shield" /><span className="micro">VERIFIED BY LEDGER</span></div><h3 className="mt-3">{elevatedActive ? "Temporary authority granted" : "Temporary authority expired"}</h3><div className="approval-countdown">{a.capability ? countdown(a.capability.expiresAt, d.now) : "—"}</div><span className="micro">SIGNER</span><Identifier value={a.walletAddress} label="verified signer" /></div>}
    {a && (expired || ["FAILED", "REJECTED", "EXPIRED"].includes(a.status)) && a.status !== "APPROVED" && <div className="approval-state"><StatusBadge tone={expired || a.status === "EXPIRED" ? "muted" : "danger"}>{expired ? "EXPIRED" : a.status}</StatusBadge><p>No authority granted.</p>{a.error && <p className="caption">{explain(a.error)}</p>}</div>}
    {a?.status === "APPROVED" && <p className="caption mt-3">Source: Ledger hardware approval</p>}
    {pending ? <div className="buttons mt-4"><button className="button primary flex-1" disabled={Boolean(d.busy) || signing || !ghostActive} onClick={() => void d.respondApproval(true, a)}><Icon name="ledger" size={16} />Approve with Ledger</button><button className="button secondary" disabled={Boolean(d.busy) || signing || !ghostActive} onClick={() => void d.respondApproval(false, a)}>Reject</button></div>
      : <button className="button primary mt-5 w-full" disabled={Boolean(d.busy) || !agent || !d.alive(agent.expiresAt) || (demo ? !demoReady : !d.owner.trim() || !d.repo.trim()) || elevatedActive} onClick={() => void d.requestAuthority(demo)}>{d.busy === "request" ? "Requesting…" : "Request Authority"}<Icon name="arrow" size={16} /></button>}
    <p className="micro mt-3">5-minute maximum grant. No admin operation or transaction is executed.</p>
    {d.pollError && <p className="feedback feedback-warning" role="alert">Approval status could not refresh. Check the backend before retrying; the last result may be stale.</p>}
    </div>
  </Card>;
}
