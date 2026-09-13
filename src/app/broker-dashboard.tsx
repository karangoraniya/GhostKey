"use client";
import { AwsPanel, AwsConfiguration } from "@/components/dashboard/aws";
import { useAws } from "@/components/dashboard/use-aws";
import Image from "next/image";
import { useState } from "react";
import { Card, EmptyState, Icon, StatusBadge, localTime } from "@/components/ui/primitives";
import { AgentPanel, AuthorityPanel } from "@/components/dashboard/authority";
import { TrustPanel, ApprovalPanel, ledgerTrust } from "@/components/dashboard/trust";
import { ProviderPanel } from "@/components/dashboard/provider";
import { DemoFlow, DemoProgress } from "@/components/dashboard/demo";
import { useDashboard } from "@/components/dashboard/use-dashboard";

const GLOSSARY = [
  ["Ghost", "A temporary identity for one agent or task."],
  ["Capability", "A scoped grant: provider + resource + action + expiry."],
  ["Ledger Trust", "Secrets stay encrypted; only the backend ever decrypts them."],
  ["Hardware Escalation", "High-risk authority needs a physical Ledger confirmation."],
] as const;

export default function BrokerDashboard() {
  const d = useDashboard();
  const aws = useAws(d);
  const trust = ledgerTrust(d);
  const [showTrust, setShowTrust] = useState(false);
  return <>
    <a className="skip-link" href="#dashboard">Skip to dashboard</a>
    <header className="topbar"><div className="topbar-inner"><a href="#" className="brand" aria-label="GhostKey home"><span className="logo-mark"><Image src="/favicon-ghost2.png" width={36} height={36} alt="" /></span><span>GhostKey<span className="brand-tagline">Give agents authority, not secrets.</span></span></a><nav className="toplinks" aria-label="Dashboard sections"><a className="selected" href="#dashboard">Overview</a><a href="#advanced">Advanced</a><a href="#activity">Activity</a></nav><div className="flex items-center gap-3"><span className="environment">LOCAL</span><a href="#trust-details" onClick={() => setShowTrust(true)} aria-label="Show Ledger status"><StatusBadge tone={trust.tone}>{trust.ready ? "LEDGER READY" : trust.checking ? "CHECKING LEDGER" : "LEDGER NOT READY"}</StatusBadge></a></div></div></header>
    <main id="dashboard" className="dashboard-shell">
      <div className="page-heading"><div><p className="eyebrow"><span className="tiny-square" /> AGENT TRUST INFRASTRUCTURE</p><h1>Authority, with boundaries.</h1><p className="hero-description">Ledger-backed trust and authorization for autonomous AI agents.</p></div><div className="hero-note brand-artwork"><Image src="/Ghost.png" width={160} height={160} alt="GhostKey — Give agents authority, not secrets." sizes="160px" /></div></div>
      <nav className="glossary-strip" aria-label="Key terms used on this page">{GLOSSARY.map(([term, def], index) => <div key={term}>{index > 0 && <Icon name="arrow" size={13} />}<strong>{term}</strong><span>{def}</span></div>)}</nav>
      <DemoProgress d={d} />
      <div className="demo-layout">
        <div className="demo-stages"><DemoFlow d={d} /><AwsPanel a={aws} d={d} /></div>
        <aside className="demo-sidebar" aria-label="Trust and activity">
          {/* Collapsed by default: stages 01-02 need no hardware at all, so a wall of
              NOT CONNECTED / NOT VERIFIED badges shouldn't greet every first-time visitor. */}
          <details id="trust-details" className="trust-disclosure" open={showTrust}>
            <summary onClick={event => { event.preventDefault(); setShowTrust(!showTrust); }}><Icon name="ledger" size={17} />Ledger Trust<span className="micro">only needed for stage 03</span><StatusBadge tone={trust.tone}>{trust.ready ? "READY" : trust.checking ? "CHECKING" : "NOT READY"}</StatusBadge></summary>
            <TrustPanel d={d} compact />
          </details>
        <Card id="activity" title="Activity" subtitle="Observed in this session." icon={<Icon name="activity" />} className="activity-panel" aside={<span className="event-count">{d.events.length}</span>}>
          {!d.events.length ? <EmptyState title="A clean audit trail">Your agent and approval events will appear here.</EmptyState> : <ol className="activity-list">{d.events.map(event => <li key={event.id}><div className={`event-dot event-${event.tone}`} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3>{event.label}</h3><time dateTime={event.at}>{localTime(event.at)}</time></div><p>{event.detail}</p><StatusBadge tone={event.tone}>{event.status}</StatusBadge></div></li>)}</ol>}
          <p className="micro activity-footer">Session activity · no credentials recorded</p>
        </Card>
        </aside>
      </div>
      <details id="advanced" className="advanced-controls">
        <summary><div><h2>Advanced Controls</h2><p>Manual scopes, provider tests, credentials, and MCP development.</p></div><span className="micro">DEVELOPER MODE +</span></summary>
        <div className="advanced-body">
          <div className="mode-note"><Icon name="shield" size={15} /><p><strong>Independent from the demo above.</strong> These controls create and manage a separate identity and capability — they never change the Demo Mode agent, and Demo Mode never uses what you create here.</p></div>
          <div className="dashboard-grid">
            <div className="dashboard-column main-column"><AgentPanel d={d} /><AuthorityPanel d={d} /><ProviderPanel d={d} /><AwsConfiguration a={aws} d={d} /></div>
            <div className="dashboard-column side-column"><TrustPanel d={d} /><ApprovalPanel d={d} />
              <Card title="MCP development" icon={<Icon name="agent" />}><p className="caption">Use the existing local MCP bridge with Claude Code or Cursor. The agent receives capability IDs, never the GitHub PAT.</p><code className="block mt-4">npm run --silent mcp</code><p className="micro mt-3">Set GHOSTKEY_BROKER_URL to this backend’s loopback address. Keep WALLET_PASS in the backend only. See README for client configuration.</p></Card>
              <Card title="Session counters"><dl className="result-facts"><div><dt>Active ghosts</dt><dd>{d.ghosts.filter(g => d.alive(g.expiresAt)).length}</dd></div><div><dt>Active capabilities</dt><dd>{d.caps.filter(d.capActive).length}</dd></div><div><dt>Blocked demos</dt><dd>{d.blockedCount}</dd></div></dl><p className="micro mt-3">Observed in this browser session only.</p></Card>
            </div>
          </div>
        </div>
      </details>
      {d.error && <div className="error-notice" role="alert"><Icon name="shield" /><div className="flex-1"><strong>{d.error.message}</strong><code>{d.error.code}</code></div><button className="icon-button" aria-label="Dismiss error" onClick={d.dismissError}>×</button></div>}
      <section className="providers-strip" aria-label="Providers"><div><span className="eyebrow">ONE TRUST LAYER.</span><h2>Any agent. Every boundary.</h2></div><div className="provider-chips"><div className="provider-chip working"><Icon name="github" size={17} /><span>GitHub<small>{d.providerVerified ? "CONNECTED" : "FIRST ADAPTER"}</small></span></div><div className="provider-chip"><span>AWS<small>{aws.status?.verifiedAt ? "CONNECTED" : aws.status?.configured ? "CONFIGURED · NOT VERIFIED" : "NOT CONFIGURED"}</small></span></div>{["Databases", "APIs", "SaaS", "Payments"].map(provider => <div className="provider-chip" key={provider}><span>{provider}<small>PLANNED</small></span></div>)}</div></section>
      <section className="security-model" aria-label="Security Model"><div className="flex flex-wrap items-center justify-between gap-3"><h2>Security Model</h2><span className="caption">Authority is explicit. Access is temporary.</span></div><div className="security-steps">{[
        ["Ghost Identity", "Temporary identity per agent or task."], ["Scoped Capability", "Provider + resource + action + TTL."], ["Ledger-Protected Secret", "Consumed internally. Never exposed to the agent."], ["Hardware Escalation", "High-risk authority requires physical confirmation."],
      ].map(([title, text], index) => <div key={title}><span className="step-number">0{index + 1}</span><h3>{title}</h3><p>{text}</p></div>)}</div>
        <div className="architecture" aria-label="Agent to provider architecture">{["Agent", "Ghost Identity", "Capability Engine", "Ledger Trust", "Provider"].map((step, index) => <div key={step} className="architecture-node"><div><strong>{step}</strong>{step === "Ledger Trust" && <small>Key Ring + Hardware Approval</small>}{step === "Provider" && <small>GitHub + AWS S3 · others planned</small>}</div>{index < 4 && <Icon name="arrow" size={15} />}</div>)}</div>
      </section>
      <footer className="dashboard-footer"><span className="flex items-center gap-2"><Image src="/favicon-ghost2.png" width={22} height={22} alt="" />GhostKey<span className="muted">/</span>Give agents authority, not secrets.</span><span>Local development · limited credentials & disposable resources</span></footer>
    </main>
  </>;
}
