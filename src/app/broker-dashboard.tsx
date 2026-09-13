"use client";
import { Web3Panel } from "@/components/dashboard/web3";
import { useWeb3 } from "@/components/dashboard/use-web3";
import { CustomSetup, CustomPanel } from "@/components/dashboard/custom";
import { useCustom } from "@/components/dashboard/use-custom";
import Image from "next/image";
import { useState } from "react";
import { AwsPanel, AwsConfiguration } from "@/components/dashboard/aws";
import { useAws } from "@/components/dashboard/use-aws";
import { Card, EmptyState, Icon, StatusBadge, localTime } from "@/components/ui/primitives";
import { AgentPanel, AuthorityPanel } from "@/components/dashboard/authority";
import { TrustPanel, ApprovalPanel, ledgerTrust } from "@/components/dashboard/trust";
import { ProviderPanel } from "@/components/dashboard/provider";
import { DemoFlow, DemoProgress } from "@/components/dashboard/demo";
import { useDashboard } from "@/components/dashboard/use-dashboard";

const sections = ["Get started", "Connections", "Custom APIs", "AWS S3", "Agent wallet", "Activity", "Developer tools", "How it works"] as const;
type Section = typeof sections[number];
const descriptions: Record<Section, string> = {
  "Get started": "Give an agent permission to do something useful. Keep the credential private.",
  Connections: "Set up provider credentials once. GhostKey protects them with Ledger Key Ring.",
  "Custom APIs": "Connect your own HTTPS JSON API. Give agents access to named read-only operations.",
  "Agent wallet": "Give an agent a Sepolia wallet with a strict spending boundary. Keep the private key inside GhostKey.",
  "AWS S3": "Use the same demo agent to safely explore one S3 bucket.",
  Activity: "See what your agent did, what was blocked, and what you approved.",
  "Developer tools": "Manual identities, permissions, provider tests, and MCP access.",
  "How it works": "Temporary identity. Scoped authority. Hardware trust.",
};
export default function BrokerDashboard() {
  const d = useDashboard();
  const aws = useAws(d);
  const custom = useCustom(d);
  const web3 = useWeb3(d);
  const trust = ledgerTrust(d);
  const [section, setSection] = useState<Section>("Get started");
  const [setupOpen, setSetupOpen] = useState(false);
  return <div className="workspace">
    <a className="skip-link" href="#workspace-content">Skip to content</a>
    <aside className="workspace-nav">
      <a className="brand" href="#workspace-content" onClick={() => setSection("Get started")}><span className="logo-mark"><Image src="/favicon-ghost2.png" width={36} height={36} alt="" /></span>GhostKey</a>
      <span className="workspace-label">YOUR WORKSPACE</span>
      <nav aria-label="Workspace">{sections.map(item => <button key={item} className={section === item ? "nav-active" : ""} aria-current={section === item ? "page" : undefined} onClick={() => setSection(item)}><Icon name={item === "Activity" ? "activity" : item === "Connections" ? "key" : item === "Get started" ? "agent" : "shield"} size={16} />{item}</button>)}</nav>
      <div className="workspace-nav-bottom"><p>Give agents authority,<br />not secrets.</p><span className="environment">LOCAL WORKSPACE</span></div>
    </aside>
    <div className="workspace-main">
      <header className="workspace-top"><span>{section}</span><button className="button quiet" onClick={() => { setSection("Connections"); setSetupOpen(true); }}><Icon name="ledger" size={15} /><span>{trust.ready ? "Ledger ready" : "Ledger setup"}</span></button></header>
      <main id="workspace-content" className="workspace-content">
        <div className="workspace-heading"><p className="eyebrow">{section === "Get started" ? "WELCOME TO GHOSTKEY" : "GHOSTKEY"}</p><h1>{section === "Get started" ? d.demoUsable ? "Your agent is ready." : "Let’s give your agent a task." : section}</h1><p>{descriptions[section]}</p></div>
        <div hidden={section !== "Get started"}>
          <div className="start-context"><Icon name="github" size={20} /><div><strong>Try it with GitHub</strong><p>Create a test issue, check the permission boundary, then try hardware approval.</p></div></div>
          {!d.credentialStored && !d.providerVerified && <div className="setup-hint"><span>First time here? Connect a test GitHub token before running your agent.</span><button className="text-link" onClick={() => { setSection("Connections"); setSetupOpen(true); }}>Set up GitHub →</button><small>Already configured on this server? You can continue below.</small></div>}
          <DemoProgress d={d} />
          <DemoFlow d={d} />
          {!d.demoUsable && <p className="workspace-footnote">Start with an agent name. We’ll set up its limited permissions for you.</p>}
          {d.demoUsable && <button className="text-link mt-5" onClick={() => setSection("AWS S3")}>Try the same agent with AWS S3 →</button>}
        </div>
        <div hidden={section !== "Connections"} className="workspace-stack">
          <Card title="GitHub" subtitle="Connect a limited test token for darkwebdev2/ghost-protocol.">
            <p className="caption">Allow repository metadata read and Issues read/write on this demo repository only. The token is encrypted on the server and never handed to your agent.</p>
            <form className="mt-4" onSubmit={d.storeCredential}><label>GitHub test token<input name="token" type="password" autoComplete="off" required maxLength={4096} placeholder="Paste your test token" /></label><div className="buttons mt-4"><button className="button primary" disabled={!!d.busy}>{d.busy === "credential" ? "Protecting token…" : "Connect GitHub"}</button>{(d.credentialStored || d.providerVerified) && <button className="button secondary" type="button" onClick={() => setSection("Get started")}>Continue to your agent →</button>}</div></form>
            {(d.credentialStored || d.providerVerified) && <p className="feedback text-success" role="status">Token protected. You’re ready to try the GitHub task.</p>}
          </Card>
          <details className="workspace-disclosure" open={setupOpen}><summary>Ledger hardware & Key Ring <span>Hardware confirmation is used for elevated permissions.</span></summary><TrustPanel d={d} /></details>
          <details className="workspace-disclosure"><summary>Custom API connection <span>Bring your own service and API key</span></summary><CustomSetup c={custom} d={d} /></details>
          <details className="workspace-disclosure"><summary>AWS connection <span>Optional second provider</span></summary><AwsConfiguration a={aws} d={d} /></details>
        </div>
        <div hidden={section !== "Custom APIs"}><button className="text-link mb-4" onClick={() => setSection("Connections")}>Add a connection →</button><CustomPanel c={custom} d={d} /></div>
        <div hidden={section !== "AWS S3"}>{!d.demoGhost && <div className="setup-hint"><span>Create your demo agent first, then reuse it here.</span><button className="text-link" onClick={() => setSection("Get started")}>Create an agent →</button></div>}<button className="text-link mb-4" onClick={() => setSection("Connections")}>Manage AWS connection →</button><AwsPanel a={aws} d={d} /></div>
        <div hidden={section !== "Agent wallet"}><Web3Panel w={web3} d={d} /></div>
        <div hidden={section !== "Activity"}><Card title="Session activity" aside={<span className="event-count">{d.events.length}</span>}>
          {!d.events.length ? <EmptyState title="Nothing here yet">Create an agent and run a task. Its results and permission checks will appear here.</EmptyState> : <ol className="activity-list">{d.events.map(event => <li key={event.id}><div className={`event-dot event-${event.tone}`} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3>{event.label}</h3><time dateTime={event.at}>{localTime(event.at)}</time></div><p>{event.detail}</p><StatusBadge tone={event.tone}>{event.status}</StatusBadge></div></li>)}</ol>}
        </Card></div>
        <div hidden={section !== "Developer tools"} className="workspace-stack" id="advanced"><p className="caption">These manual controls use a separate selection from the guided demo.</p><AgentPanel d={d} /><AuthorityPanel d={d} /><ProviderPanel d={d} /><ApprovalPanel d={d} /><Card title="MCP access"><p className="caption">Connect Claude Code or Cursor to the existing local bridge. Set GHOSTKEY_BROKER_URL to this backend’s loopback address. Keep WALLET_PASS on the backend.</p><code className="block mt-4">npm run --silent mcp</code></Card></div>
        <div hidden={section !== "How it works"}><Card title="You set the boundaries. Your agent works inside them."><ol className="workspace-explainer">{[
          ["Create an agent", "An identity for one task. It expires automatically."],
          ["Give it specific permissions", "Choose what it can do and which repository or bucket it can access."],
          ["Keep credentials protected", "GhostKey uses Ledger Key Ring internally. The agent only receives a temporary capability ID."],
          ["Approve more authority yourself", "Higher-risk authority requires a signature confirmed on your physical Ledger. It expires after a short time."],
        ].map(([title, body], i) => <li key={title}><span>0{i + 1}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol><p className="caption">GitHub, AWS S3, operator-configured read-only JSON APIs, and scoped Sepolia agent wallets are supported.</p></Card></div>
        {d.error && <div className="feedback feedback-warning" role="alert"><strong>{d.error.message}</strong><code className="block mt-2">{d.error.code}</code><div className="buttons mt-3"><button className="text-link" onClick={() => setSection("Connections")}>Open connections</button><button className="text-link" onClick={d.dismissError}>Dismiss</button></div></div>}
      </main>
    </div>
  </div>;
}
