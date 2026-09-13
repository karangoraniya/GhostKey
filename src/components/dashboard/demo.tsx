import { Card, Icon, Identifier, StatusBadge, countdown } from "@/components/ui/primitives";
import { ApprovalPanel } from "./trust";
import { DEMO_RESOURCE, type Dashboard } from "./use-dashboard";

export function DemoProgress({ d }: { d: Dashboard }) {
  const complete = [Boolean(d.demoCap), Boolean(d.demoIssue), d.demoApproval?.status === "APPROVED"];
  const current = !d.demoUsable ? 0 : !d.demoIssue || !d.demoBlocked ? 1 : 2;
  return <nav className="demo-progress" aria-label="Demo progress">{["Agent", "Execute", "Approve"].map((label, index) =>
    <a key={label} href={`#demo-${["agent", "execute", "approve"][index]}`} className={current === index ? "is-current" : ""} aria-current={current === index ? "step" : undefined}>
      <span className={complete[index] ? "step-complete" : ""}>{complete[index] ? "✓" : `0${index + 1}`}</span>{label}
    </a>)}<span className="demo-label">DEMO MODE</span></nav>;
}
export function DemoFlow({ d }: { d: Dashboard }) {
  const running = d.demoRunState === "running";
  const succeeded = d.demoRunState === "success" && Boolean(d.demoIssue);
  const issue = d.demoIssue;
  return <div className="demo-stages">
    <Card id="demo-agent" title="Create Agent" subtitle="An ephemeral identity. Only the authority it needs." icon={<span className="stage-number">01</span>} className={`demo-stage ${d.demoUsable ? "stage-completed" : "stage-current"}`} aside={!d.demoGhost ? <StatusBadge tone="warning" pulse>START HERE</StatusBadge> : undefined}>
      <form className="inline-form" onSubmit={event => { event.preventDefault(); void d.createDemoAgent(); }}>
        <label className="flex-1">Agent name<input value={d.name} onChange={event => d.setName(event.target.value)} required maxLength={100} /></label>
        <button className="button primary" disabled={Boolean(d.busy) || !d.name.trim()}>{d.busy === "demo-setup" ? "Creating agent & authority…" : d.demoGhost && !d.demoCap ? "Retry Agent Setup" : "Create Agent"}<Icon name="arrow" size={16} /></button>
      </form>
      <p className="caption mt-3">Automatically grants repository read and issue creation for 30 minutes.</p>
      {d.demoCap && d.demoGhost && <div className="demo-agent-result" role="status"><div className="flex flex-wrap items-center justify-between gap-3"><StatusBadge tone={d.demoUsable ? "success" : "muted"}>{d.demoUsable ? "AGENT ACTIVE" : "AUTHORITY EXPIRED"}</StatusBadge><span className="caption">Expires in <code>{countdown(d.demoCap.expiresAt, d.now)}</code></span></div><Identifier value={d.demoGhost.id} label="demo ghost ID" /><div className="buttons mt-3"><code className="action-token">repo.read</code><code className="action-token">issue.create</code></div></div>}
      {d.demoGhost && !d.demoCap && d.busy !== "demo-setup" && <p className="feedback feedback-warning" role="status">Identity created, but capability setup did not finish. Retry to complete setup.</p>}
    </Card>
    <Card id="demo-execute" title="Run Agent" subtitle="Create a real GitHub issue without handing the credential to the agent." icon={<span className="stage-number">02</span>} className={`demo-stage ${d.demoUsable && !d.demoBlocked ? "stage-current" : ""} ${!d.demoUsable ? "stage-locked" : ""}`} aside={<span className="section-number">FIRST PROVIDER ADAPTER · GITHUB</span>}>
      {!d.demoUsable && <div className="lock-banner"><Icon name="shield" size={13} />Locked — create an agent in stage 01 first</div>}
      <div className={!d.demoUsable ? "stage-dimmed" : ""}>
      <div className="demo-task"><span className="micro">AUTHORIZED TASK</span><code>{DEMO_RESOURCE.owner}/{DEMO_RESOURCE.repo}</code></div>
      <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void d.provider("issue", { title: String(data.get("title")), body: String(data.get("body")) }, true); }}>
        <label>Issue title<input name="title" defaultValue="GhostKey agent demo" required maxLength={256} /></label>
        <label className="mt-3">Issue body<textarea name="body" rows={2} defaultValue="Created by an ephemeral GhostKey agent using scoped authority." maxLength={10000} /></label>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4"><span className="micro">{d.demoUsable ? "Creates a real issue. Each run creates another issue." : "Create an agent with active authority to begin."}</span><button className="button primary" disabled={Boolean(d.busy) || !d.demoUsable}>{running ? "Agent running…" : "Run with GhostKey"}<Icon name="arrow" size={16} /></button></div>
      </form>
      {(running || succeeded || d.demoRunState === "failed") && <div className="execution-trace" role="status" aria-label="Execution checks">
        <div className="flex flex-wrap justify-between gap-2"><span className="micro">{running ? "EXECUTING ON THE BACKEND" : succeeded ? "BACKEND-CONFIRMED EXECUTION" : "EXECUTION DID NOT COMPLETE"}</span>{running && <StatusBadge tone="warning" pulse>RUNNING</StatusBadge>}</div>
        <ol>{[
          ["Checking ghost identity…", "Ghost active"], ["Validating capability…", "github.issue.create allowed"],
          ["Accessing protected credential…", "Ledger Key Ring"], ["Executing provider action…", "GitHub issue created"],
        ].map(([pending, done]) => <li key={pending}><span className={succeeded ? "text-success" : "muted"}>{succeeded ? "✓" : "·"}</span>{succeeded ? done : pending}</li>)}</ol>
        {!succeeded && <p className="micro">{running ? "These are the backend’s execution stages. Checks are confirmed together when its response arrives." : "No successful checks are claimed. Review the error before retrying."}</p>}
      </div>}
      {issue && succeeded && <div className="demo-result" role="status"><StatusBadge tone="success">AUTHORIZED EXECUTION</StatusBadge><h3>✓ Issue #{issue.number} created</h3><dl className="result-facts"><div><dt>Credential exposed to agent</dt><dd>NO</dd></div><div><dt>Capability</dt><dd><code>github.issue.create</code></dd></div><div><dt>Resource</dt><dd><code>{issue.owner}/{issue.repo}</code></dd></div><div><dt>Authority expires</dt><dd><code>{d.demoCap && countdown(d.demoCap.expiresAt, d.now)}</code></dd></div></dl><a className="text-link" href={`https://github.com/${encodeURIComponent(issue.owner)}/${encodeURIComponent(issue.repo)}/issues/${issue.number}`} target="_blank" rel="noreferrer">View Issue ↗</a></div>}
      {/* Independent of running the agent above: the boundary test only needs active authority, so it never dead-ends behind a GitHub credential. */}
      <div className="demo-boundary"><h3>Test the boundary</h3><p>What happens when the same agent asks for authority it does not have?</p><button className="button danger mt-4" disabled={Boolean(d.busy) || !d.demoUsable} onClick={() => void d.provider("blocked", undefined, true)}>{d.busy === "demo-blocked" ? "Checking boundary…" : "Test Unauthorized Action"}</button>
        {d.demoBlocked && <div className="demo-result blocked-proof" role="status"><StatusBadge tone="danger">BLOCKED</StatusBadge><h3><code>ACTION_NOT_ALLOWED</code></h3><dl className="result-facts"><div><dt>Requested action</dt><dd><code>github.repo.delete</code></dd></div><div><dt>Provider request sent</dt><dd>NO</dd></div><div><dt>Credential exposed</dt><dd>NO</dd></div><div><dt>Reason</dt><dd>Outside agent capability</dd></div></dl></div>}
      </div>
      </div>
    </Card>
    <ApprovalPanel d={d} demo />
  </div>;
}
