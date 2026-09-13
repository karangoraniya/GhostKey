# GhostKey

**Give agents authority, not secrets.**

GhostKey is a Ledger-backed capability broker for AI agents. An agent never
receives a real GitHub token, AWS key, API credential, or wallet private key —
it receives a random, short-lived **capability ID** scoped to one provider,
one resource, one action, and one expiry. The real secret stays encrypted in a
Ledger Key Ring on the backend and is decrypted only inside the request that
uses it. Anything higher risk — right now, `github.admin.write` — requires a
physical signature confirmed on a Ledger hardware device before GhostKey will
mint it.

```text
Agent → Ghost Identity → Capability → Ledger Trust → Provider
                                          │
                                          └─ Hardware Escalation (high-risk only)
```

## What's built

- **Four providers on one engine** — GitHub (repo read, issue create), AWS S3
  (list/read one bucket), a bring-your-own read-only HTTPS JSON API, and a
  Sepolia test-ETH wallet with a fixed recipient/amount/budget.
- **Hardware-backed escalation** — `github.admin.write` requires a real
  EIP-712 signature reviewed and confirmed on a physical Ledger before a
  temporary, 5-minute elevated capability is minted. No admin operation is
  actually implemented — this proves the escalation boundary, nothing more.
- **A local MCP server** — Claude Code, Cursor, or any MCP client connects
  over stdio and gets exactly seven scoped tools. No credential, environment,
  or connection-management tool exists over MCP.
- **A guided dashboard** — create an agent, run it, test the boundary it
  can't cross, then request and physically approve elevated authority.

## Run it locally

```sh
bun install --frozen-lockfile
bun run dev --port 3100
```

Open `http://127.0.0.1:3100`. Prerequisites, the full setup walkthrough, and
the trust model are in **[`docs/README.md`](docs/README.md)** — also viewable
live in the running app at `/docs`.

```sh
bun run typecheck
bun run lint
bun run test
bun run build
```

## Connect an agent

```sh
claude mcp add ghostkey --transport stdio --scope local \
  --env GHOSTKEY_BROKER_URL=http://127.0.0.1:3100 \
  -- npm --prefix "$PWD" --silent run mcp
```

## Docs

- **[`docs/README.md`](docs/README.md)** — the full map: the model, every
  provider, hardware-backed approval, MCP tools, the complete API reference,
  and the trust model.
- **[`docs/custom-api.md`](docs/custom-api.md)** — Custom API provider deep dive.
- **[`public/pitchdeck.html`](public/pitchdeck.html)** — the project pitch deck
  (open it directly, or visit `/pitchdeck.html` while the app is running).

## Trust model, in short

This is a **trusted-operator surface, not an authenticated multi-user API** —
anyone who can reach the local HTTP surface can mint a grant. It's designed to
run on your own machine, protecting your own credentials, with your own
Ledger. Never expose the backend beyond loopback. See
[`docs/README.md#trust-model-read-this`](docs/README.md#trust-model-read-this)
for the full reasoning.

---

Built for ETHOnline 2026.
