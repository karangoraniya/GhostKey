import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Documentation — GhostKey",
  description: "How to use GhostKey: the ghost/capability model, every provider, MCP integration, hardware approval, and the full API reference.",
};

const SECTIONS = [
  ["model", "The model"], ["running", "Running it locally"], ["dashboard", "Using the dashboard"],
  ["providers", "Providers"], ["hardware", "Hardware-backed approval"], ["boundary", "Testing the boundary"],
  ["mcp", "MCP integration"], ["api", "API reference"], ["trust", "Trust model"], ["testing", "Testing"],
] as const;

export default function DocsPage() {
  return <div className="workspace">
    <a className="skip-link" href="#docs-content">Skip to content</a>
    <aside className="workspace-nav">
      <Link className="brand" href="/"><span className="logo-mark"><Image src="/favicon-ghost2.png" width={36} height={36} alt="" /></span>GhostKey</Link>
      <span className="workspace-label">DOCUMENTATION</span>
      <nav aria-label="Docs sections">{SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
      <div className="workspace-nav-bottom"><p>Give agents authority,<br />not secrets.</p><Link className="button quiet mt-3" href="/"><Icon name="arrow" size={14} />Back to dashboard</Link></div>
    </aside>
    <div className="workspace-main">
      <header className="workspace-top"><span>Documentation</span><a className="button quiet" href="https://github.com/karangoraniya/GhostKey" target="_blank" rel="noreferrer"><Icon name="github" size={15} /><span>Repository</span></a></header>
      <main id="docs-content" className="workspace-content">
        <div className="workspace-heading"><p className="eyebrow">GHOSTKEY</p><h1>How GhostKey works.</h1><p>An AI agent never receives a real credential — it receives a scoped, short-lived capability ID. This page is the full map.</p></div>

        <nav className="docs-toc" aria-label="Jump to section">{SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>

        <div className="docs-body">
          <h2 id="model">The model</h2>
          <p>GhostKey is a Ledger-backed capability broker. The real secret — a GitHub token, an AWS key, an API credential — stays encrypted in a Ledger Key Ring on the backend and is decrypted only for the instant it&apos;s needed. The agent only ever holds a random capability ID.</p>
          <pre><code>{`Agent → Ghost Identity → Capability → Ledger Trust → Provider
                              │
                              └─ Hardware Escalation (high-risk only)`}</code></pre>
          <div className="docs-table-wrap"><table className="docs-table">
            <thead><tr><th>Term</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td><strong>Ghost</strong></td><td>A temporary identity for one agent or task. Expires on its own; nothing survives a backend restart.</td></tr>
              <tr><td><strong>Capability</strong></td><td><code>provider + resource + action(s) + TTL</code>, capped by its ghost&apos;s remaining lifetime.</td></tr>
              <tr><td><strong>Ledger Trust</strong></td><td>The Key Ring (<code>wallet-cli ring</code>) that encrypts every stored credential. Only the backend ever decrypts one.</td></tr>
              <tr><td><strong>Hardware Escalation</strong></td><td>High-risk authority (<code>github.admin.write</code>) needs a physical Ledger signature before it&apos;s granted, for at most 5 minutes.</td></tr>
            </tbody>
          </table></div>

          <h2 id="running">Running it locally</h2>
          <pre><code>{`bun install --frozen-lockfile
bun run dev --port 3100`}</code></pre>
          <p>Open <code>http://127.0.0.1:3100</code>. The server binds to loopback only — see <a href="#trust">Trust model</a> before exposing it any other way.</p>
          <ul>
            <li>Node.js 20.9+ and Bun (this repo is pinned to Bun 1.3.14).</li>
            <li><code>wallet-cli</code> on the backend process&apos;s <code>PATH</code>, with a Key Ring already initialized (<code>wallet-cli ring init</code>).</li>
            <li>A password-protected ring needs <code>WALLET_PASS</code> set in the backend&apos;s own environment — never in the browser or an agent.</li>
            <li>A physical Ledger (USB, Ethereum app open) is only required for hardware approval. Everything else works without one.</li>
          </ul>

          <h2 id="dashboard">Using the dashboard</h2>
          <p>The dashboard is one workspace with a left-hand section switcher:</p>
          <div className="docs-table-wrap"><table className="docs-table">
            <thead><tr><th>Section</th><th>What it&apos;s for</th></tr></thead>
            <tbody>
              <tr><td>Get started</td><td>The guided demo: create an agent, run it against GitHub, test the boundary, then request hardware-backed authority.</td></tr>
              <tr><td>Connections</td><td>One-time operator setup: GitHub token, Ledger Trust, Custom API connections, AWS. Encrypted immediately, never shown again.</td></tr>
              <tr><td>Custom APIs</td><td>Run a named read-only operation against a connection you configured, under a scoped capability.</td></tr>
              <tr><td>AWS S3</td><td>Reuse the demo agent against one bucket: list, read a text object, or try a blocked delete.</td></tr>
              <tr><td>Agent wallet</td><td>Create or import a disposable Sepolia test wallet, grant a spending-scoped capability, read its balance, or send a capped test transfer.</td></tr>
              <tr><td>Activity</td><td>A live, session-local log — this browser tab only, not a durable audit store.</td></tr>
              <tr><td>Developer tools</td><td>Manual identity/capability creation with editable scopes, raw provider calls, and the MCP command.</td></tr>
              <tr><td>How it works</td><td>A plain-language recap of the model above.</td></tr>
            </tbody>
          </table></div>
          <p>Developer tools and the guided demo track separate ghost/capability selections on purpose — nothing you do in one affects the other.</p>

          <h2 id="providers">Providers</h2>
          <p>All four providers share one engine. Every provider call re-validates a capability — existence, revocation, expiry, ghost, provider, action, resource — <strong>before</strong> decrypting any credential, and again immediately before the outbound request.</p>
          <h3>GitHub</h3>
          <ul>
            <li>Actions: <code>github.repo.read</code>, <code>github.issue.create</code>.</li>
            <li>Resource: <code>{`{ owner, repo }`}</code> — exact, case-insensitive. No URLs, no wildcards.</li>
            <li>Setup: <strong>Connections → GitHub</strong>, a fine-grained PAT on one disposable test repo. The field clears on submit; the token is encrypted under <code>ghostkey-github</code>.</li>
          </ul>
          <h3>AWS S3</h3>
          <ul>
            <li>Actions: <code>aws.s3.list</code>, <code>aws.s3.read</code>. Write/delete cannot be minted or executed by anything in this codebase.</li>
            <li>Resource: one exact bucket name. A list <code>prefix</code> is a filter, not an authorization boundary — the grant covers the whole bucket.</li>
            <li>Setup: <strong>Connections → AWS</strong>, with a dedicated IAM credential scoped to <code>s3:ListBucket</code> + <code>s3:GetObject</code> on that bucket only.</li>
            <li>Object reads are capped at 1 MiB of UTF-8 text.</li>
          </ul>
          <h3>Custom API</h3>
          <p>Bring your own read-only HTTPS JSON API (bearer token or API-key header), define named GET-only operations, and grant an agent access by name (<code>custom.read.&lt;operation&gt;</code>). GET only, exact configured paths, responses capped at 512 KiB, private/loopback/metadata IPs rejected before any credential is decrypted. Full setup and limits: <Link href="https://github.com/karangoraniya/GhostKey/blob/main/docs/custom-api.md" target="_blank">docs/custom-api.md</Link>.</p>
          <h3>Web3 (Sepolia test transfers)</h3>
          <ul>
            <li>Actions: <code>web3.balance.read</code>, <code>web3.transfer</code>. Mainnet, arbitrary signing, and contract calls are unsupported.</li>
            <li>A <strong>software wallet</strong> (generated or imported — a dedicated test key, never your real one), key-encrypted the same way as every other credential. The physical Ledger is <strong>not</strong> used to sign transfers — only <code>github.admin.write</code> uses the device.</li>
            <li>Resource: one wallet, Sepolia only (<code>chainId 11155111</code>), one fixed recipient, a max-per-transfer cap (0.001 test ETH), and a total fee-inclusive budget cap (0.005 test ETH) — set at grant time.</li>
            <li>Transfers are idempotent (client-supplied <code>requestId</code> UUID; retries must reuse it), serialized per wallet, EOA-only, fee-capped, and re-validated before <em>and</em> after signing.</li>
            <li>Setup: <strong>Agent wallet</strong> → create/import a wallet → fund its Sepolia address from a faucet yourself → set recipient/caps → grant.</li>
          </ul>

          <h2 id="hardware">Hardware-backed approval</h2>
          <p><code>github.admin.write</code> is never included in a normal grant. Getting it:</p>
          <ol>
            <li><code>POST /api/approvals</code> creates a pending request bound to one ghost, action, and exact resource — pinning the connected Ledger&apos;s public address. No signature yet.</li>
            <li><code>POST /api/approvals/{"{id}"}/ledger-approve</code> starts real signing: an EIP-712 challenge binding ghost, action, resource, risk, expiry, and a random nonce. <strong>Review the request on the device screen before confirming.</strong></li>
            <li>The backend recovers the signer with <code>viem</code> and compares it to the pinned address. Only on a match does it mint <code>github.admin.write</code>, <code>risk: &quot;HIGH&quot;</code>, for at most 5 minutes.</li>
            <li><code>POST /api/approvals/{"{id}"}/reject</code> rejects from the UI side — it can&apos;t dismiss the physical device screen; reject there, or let it time out.</li>
          </ol>
          <div className="docs-callout"><Icon name="shield" size={14} /><p>There is no <code>github.admin.write</code> execution anywhere in this codebase. This flow demonstrates that escalation requires a human with a hardware key — nothing more.</p></div>

          <h2 id="boundary">Testing the boundary</h2>
          <p>Every provider ships a call that policy always refuses, checked and rejected <strong>before</strong> any credential loads or any request sends:</p>
          <ul>
            <li>GitHub: <code>POST /api/github/blocked-action</code> → <code>github.repo.delete</code></li>
            <li>AWS: <code>POST /api/aws/s3/demo-blocked</code> → <code>aws.s3.delete</code></li>
          </ul>
          <p>Both always return <code>{`{ "success": false, "error": "ACTION_NOT_ALLOWED" }`}</code>, and neither route even imports its provider&apos;s SDK.</p>

          <h2 id="mcp">MCP integration</h2>
          <p>The local MCP server bridges an agent (Claude Code, Cursor, any MCP client) to this same backend over loopback-only <code>POST /api/mcp/tools</code> — no state is duplicated.</p>
          <pre><code>GHOSTKEY_BROKER_URL=http://127.0.0.1:3100 npm run --silent mcp</code></pre>
          <div className="docs-table-wrap"><table className="docs-table">
            <thead><tr><th>Tool</th><th>Requires</th><th>Does</th></tr></thead>
            <tbody>
              <tr><td><code>ghost_capabilities</code></td><td>ghostId</td><td>Lists that ghost&apos;s active capabilities</td></tr>
              <tr><td><code>ghost_github_read_repo</code></td><td><code>github.repo.read</code></td><td>Safe repo metadata</td></tr>
              <tr><td><code>ghost_github_create_issue</code></td><td><code>github.issue.create</code></td><td>Creates a real issue</td></tr>
              <tr><td><code>ghost_demo_forbidden_action</code></td><td>any GitHub cap</td><td>Always <code>ACTION_NOT_ALLOWED</code></td></tr>
              <tr><td><code>ghost_custom_read</code></td><td><code>custom.read.*</code></td><td>Runs one named operation</td></tr>
              <tr><td><code>ghost_web3_balance</code></td><td><code>web3.balance.read</code></td><td>Reads Sepolia test-ETH balance</td></tr>
              <tr><td><code>ghost_web3_transfer</code></td><td><code>web3.transfer</code></td><td>Submits a capped Sepolia transfer, idempotent on retry</td></tr>
            </tbody>
          </table></div>
          <p>No credential, environment, or connection/wallet-management tool exists over MCP. Extra fields are rejected; a capability from a different ghost returns <code>GHOST_MISMATCH</code>.</p>

          <h2 id="api">API reference</h2>
          <p>Every route is a same-origin, loopback-only JSON <code>POST</code> (noted otherwise), <code>Cache-Control: no-store</code>.</p>
          <div className="docs-table-wrap"><table className="docs-table">
            <thead><tr><th>Route</th><th>Body</th><th>Returns</th></tr></thead>
            <tbody>
              <tr><td><code>/api/ghosts</code></td><td><code>name, ttlSeconds</code></td><td><code>ghostId, expiresAt</code></td></tr>
              <tr><td><code>/api/capabilities</code></td><td><code>ghostId, provider, ttlSeconds, actions, …resource</code></td><td><code>capabilityId, expiresAt, actions</code></td></tr>
              <tr><td><code>/api/github/credential</code></td><td><code>token</code></td><td><code>success</code></td></tr>
              <tr><td><code>/api/github/repo</code></td><td><code>capabilityId, owner, repo</code></td><td>Safe repo fields</td></tr>
              <tr><td><code>/api/github/issues</code></td><td><code>capabilityId, owner, repo, title, body?</code></td><td><code>number, title, state</code></td></tr>
              <tr><td><code>/api/aws/credentials</code></td><td><code>accessKeyId, secretAccessKey, sessionToken?, region</code></td><td><code>success</code></td></tr>
              <tr><td><code>/api/aws/s3/list</code></td><td><code>ghostId, capabilityId, bucket, prefix?</code></td><td>Safe object list</td></tr>
              <tr><td><code>/api/aws/s3/read</code></td><td><code>ghostId, capabilityId, bucket, key</code></td><td>Text, ≤1 MiB</td></tr>
              <tr><td><code>/api/custom/connections</code></td><td><code>name, baseUrl, auth, secret, operations</code></td><td>Public metadata</td></tr>
              <tr><td><code>/api/custom/execute</code></td><td><code>ghostId, capabilityId, connectionId, operation</code></td><td><code>operation, data</code></td></tr>
              <tr><td><code>/api/web3/wallets</code></td><td><code>mode: &quot;generate&quot;</code> or <code>&quot;import&quot;</code>, name</td><td>Wallet metadata only — never the key</td></tr>
              <tr><td><code>/api/web3/balance</code></td><td><code>ghostId, capabilityId, walletId, chainId</code></td><td><code>address, balanceWei</code></td></tr>
              <tr><td><code>/api/web3/transfer</code></td><td><code>ghostId, capabilityId, walletId, chainId, to, valueWei, requestId</code></td><td><code>status, transactionHash</code></td></tr>
              <tr><td><code>/api/approvals</code></td><td><code>ghostId, requestedAction, resource</code></td><td>Pending approval</td></tr>
              <tr><td><code>GET /api/approvals/{"{id}"}</code></td><td>—</td><td>Approval state + capability</td></tr>
              <tr><td><code>/api/approvals/{"{id}"}/ledger-approve</code></td><td><code>ghostId, requestedAction, resource</code></td><td>Signing → approval result</td></tr>
              <tr><td><code>GET /api/ledger/device/status</code></td><td>—</td><td>Device/app state, address</td></tr>
              <tr><td><code>GET /api/keyring/status</code></td><td>—</td><td><code>status, cliAvailable</code></td></tr>
            </tbody>
          </table></div>
          <p>Full route list, every error code, and status-code mapping: see <Link href="https://github.com/karangoraniya/GhostKey/blob/main/docs/README.md" target="_blank">docs/README.md</Link> in the repository.</p>

          <h2 id="trust">Trust model</h2>
          <div className="docs-callout"><Icon name="shield" size={14} /><p>This is a trusted-operator surface, not an authentication boundary. Anyone who can reach <code>/api/ghosts</code> or <code>/api/capabilities</code> can mint a grant. Never expose this backend beyond loopback, and never give an untrusted agent unrestricted access to the local HTTP surface — MCP&apos;s tool set is the only thing meant for an agent to touch.</p></div>
          <p>Everything is process-local and in-memory. A backend restart clears every ghost, capability, revocation, connection, approval, and stored credential — there is no database. Secrets are never returned by any route, logged, or written to a permanent plaintext file.</p>

          <h2 id="testing">Testing</h2>
          <pre><code>{`bun run typecheck
bun run lint
bun run test
bun run build`}</code></pre>
          <p>Unit tests cover capability policy, every provider boundary, approval lifecycle, and MCP tool contracts — all mocked, no real Ledger, GitHub, AWS, or API calls. Real hardware signing and real provider calls are manual checks.</p>
        </div>
      </main>
    </div>
  </div>;
}
