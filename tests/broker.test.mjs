import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { web3Tests } from "./web3-cases.mjs";
import { customTests } from "./custom-cases.mjs";
import { awsTests } from "./aws-cases.mjs";
import { approvalTests } from "./approval-cases.mjs";

// Compile a disposable copy of the real modules. Only Ledger and GitHub are mocked.
test("capability broker and provider boundary", async t => {
  const root = await mkdtemp(join(tmpdir(), "ghostkey-broker-tests-"));
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    async function compile(directory) {
      for (const item of await readdir(directory, { withFileTypes: true })) {
        const source = join(directory, item.name);
        if (item.isDirectory()) { await compile(source); continue; }
        if (!source.endsWith(".ts")) continue;
        let code = await readFile(source, "utf8");
        code = code.replaceAll('import "server-only";', "");
        code = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
        code = code.replace(/from "([^"]+)"/g, (match, specifier) => {
          if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return `from "${import.meta.resolve(specifier)}"`;
          let target = specifier.startsWith("@/") ? resolve("src", specifier.slice(2)) : resolve(dirname(source), specifier);
          if (target.endsWith("/lib/capabilities")) target += "/index";
          const dest = join(root, relative(resolve("src"), target) + ".mjs");
          return `from "${pathToFileURL(dest).href}"`;
        });
        const dest = join(root, relative("src", source).replace(/\.ts$/, ".mjs"));
        await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, code);
      }
    }
    await compile("src/lib"); await compile("src/mcp"); await compile("src/types"); await compile("src/app/api");
    await writeFile(join(root, "lib/ledger/keyring.mjs"), `
export let loads = 0;
export let encryptions = 0;
export let afterLoad;
export function setAfterLoad(fn) { afterLoad = fn; }
export async function encryptSecret({value, keyName}) { encryptions++; if(!keyName.startsWith('web3-') && !keyName.startsWith('custom-') && !['ghostkey-github', 'ghostkey-aws-access-key', 'ghostkey-aws-secret-key', 'ghostkey-aws-session-token'].includes(keyName)) throw Error(); return Buffer.from(value).toString('base64'); }
export async function decryptSecret({encrypted}) { loads++; afterLoad?.(); return Buffer.from(encrypted,'base64').toString(); }
`);
    const load = path => import(pathToFileURL(join(root, path + ".mjs")));
    const ghosts = await load("lib/broker/ghostIdentity");
    const caps = await load("lib/capabilities/index");
    const { state } = await load("lib/broker/state");
    await approvalTests(t, load, { advance: ms => { now += ms; } });
    const ledger = await load("lib/ledger/keyring");
    const credentials = await load("lib/providers/github/credentials");
    const client = await load("lib/providers/github/client");
    const scope = { owner: "owner", repo: "repo" };
    const make = (actions = ["github.repo.read", "github.issue.create"], ttlSeconds = 900) => {
      const ghost = ghosts.createGhostIdentity({ name: "test-agent", ttlSeconds: 1800 });
      const cap = caps.createCapability({ ghostId: ghost.id, provider: "github", ...scope, actions, ttlSeconds });
      return { ghost, cap };
    };
    const validate = (cap, extras = {}) => caps.validateCapability({ capabilityId: cap.id, provider: "github", action: "github.repo.read", ...scope, ...extras });
    await t.test("valid capability, random IDs, immutable copies, lifetime bound", () => {
      const { cap, ghost } = make(); assert.equal(validate(cap).id, cap.id);
      assert.notEqual(make().cap.id, cap.id); assert.match(ghost.id, /^ghost_[a-f0-9]{48}$/);
      cap.actions.length = 0; cap.resource.repo = "other"; assert.equal(validate(cap).actions.length, 2);
      const long = caps.createCapability({ ghostId: ghost.id, provider: "github", ...scope, actions: ["github.repo.read"], ttlSeconds: 86400 });
      assert.equal(long.expiresAt, ghost.expiresAt);
    });
    await t.test("expired capability fails at exact expiry", () => {
      const { cap } = make(undefined, 1); now += 1000;
      assert.throws(() => validate(cap), { code: "CAPABILITY_EXPIRED" });
    });
    await t.test("wrong repository and provider fail", () => {
      const { cap } = make(); assert.throws(() => validate(cap, { repo: "other" }), { code: "RESOURCE_NOT_ALLOWED" });
      assert.throws(() => validate(cap, { provider: "aws" }), { code: "PROVIDER_NOT_ALLOWED" });
      assert.equal(validate(cap, { owner: "OWNER", repo: "REPO" }).id, cap.id);
    });
    await t.test("unauthorized and unknown actions fail; delete cannot be granted", () => {
      const { cap, ghost } = make(["github.repo.read"]);
      for (const action of ["github.issue.create", "github.repo.delete"]) assert.throws(() => validate(cap, { action }), { code: "ACTION_NOT_ALLOWED" });
      assert.throws(() => caps.createCapability({ ghostId: ghost.id, provider: "github", ...scope, actions: ["github.repo.delete"], ttlSeconds: 30 }), { code: "ACTION_NOT_ALLOWED" });
    });
    await t.test("expired ghost identity fails", () => {
      const { cap, ghost } = make(); ghosts.expireGhostIdentity(ghost.id);
      assert.throws(() => validate(cap), { code: "GHOST_EXPIRED" });
      assert.throws(() => ghosts.getGhostIdentity(ghost.id), { code: "GHOST_EXPIRED" });
      const short = ghosts.createGhostIdentity({ name: "short", ttlSeconds: 1 }); now += 1000;
      assert.throws(() => ghosts.getGhostIdentity(short.id), { code: "GHOST_EXPIRED" });
    });
    await t.test("revoked and nonexistent capability fail", () => {
      const { cap } = make(); caps.revokeCapability(cap.id);
      assert.throws(() => validate(cap), { code: "CAPABILITY_REVOKED" });
      assert.throws(() => validate({ id: "missing" }), { code: "CAPABILITY_NOT_FOUND" });
    });
    let calls = 0;
    const fakeToken = "test-" + originalNow();
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(options.headers.get("Authorization"), `Bearer ${fakeToken}`);
      assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store");
      assert.match(url, /^https:\/\/api.github.com\/repos\/owner\/repo/);
      return Response.json(options.method === "POST" ? { number: 1, title: "test", state: "open", extra: fakeToken }
        : { name: "repo", description: "test", private: false, default_branch: "main", extra: fakeToken });
    };
    await t.test("store encrypts; provider only returns safe projections", async () => {
      await credentials.storeGitHubCredential(fakeToken);
      assert.equal(ledger.encryptions, 1); assert.notEqual(state.encryptedGitHubToken, fakeToken);
      const { cap } = make();
      assert.deepEqual(await client.getRepository({ ...scope, capabilityId: cap.id }), { name: "repo", description: "test", private: false, defaultBranch: "main" });
      assert.deepEqual(await client.createIssue({ ...scope, capabilityId: cap.id, title: "test" }), { number: 1, title: "test", state: "open" });
    });
    await t.test("policy rejection happens before credential loading and GitHub", async () => {
      const { cap } = make(["github.repo.read"]); const before = [calls, ledger.loads];
      await assert.rejects(client.createIssue({ ...scope, capabilityId: cap.id, title: "test" }), { code: "ACTION_NOT_ALLOWED" });
      await assert.rejects(client.getRepository({ ...scope, repo: "other", capabilityId: cap.id }), { code: "RESOURCE_NOT_ALLOWED" });
      assert.deepEqual([calls, ledger.loads], before);
    });
    await t.test("revocation during decryption blocks fetch", async () => {
      const { cap } = make(); const before = calls;
      ledger.setAfterLoad(() => caps.revokeCapability(cap.id));
      await assert.rejects(client.getRepository({ ...scope, capabilityId: cap.id }), { code: "CAPABILITY_REVOKED" });
      ledger.setAfterLoad(undefined); assert.equal(calls, before);
    });
    const invoke = async (path, body, extraHeaders = {}) => {
      const { POST } = await load(`app/api/${path}/route`);
      return POST(new Request(`http://127.0.0.1:3000/api/${path}`, { method: "POST", body: JSON.stringify(body), headers: { Host: "localhost:3000", Origin: "http://localhost:3000", "Content-Type": "application/json", ...extraHeaders } }));
    };
    await t.test("API complete flow and blocked-delete demo without credential access", async () => {
      const ghost = await (await invoke("ghosts", { name: "client", ttlSeconds: 1800 })).json();
      const cap = await (await invoke("capabilities", { ghostId: ghost.ghostId, provider: "github", ...scope, actions: ["github.repo.read", "github.issue.create"], ttlSeconds: 900 })).json();
      assert.deepEqual(await (await invoke("github/credential", { token: fakeToken })).json(), { success: true });
      const input = { ...scope, capabilityId: cap.capabilityId };
      assert.equal((await invoke("github/repo", input)).status, 200);
      assert.equal((await invoke("github/issues", { ...input, title: "test" })).status, 200);
      const before = [calls, ledger.loads];
      const blocked = await invoke("github/blocked-action", input);
      assert.equal(blocked.status, 403); assert.deepEqual(await blocked.json(), { success: false, error: "ACTION_NOT_ALLOWED" });
      assert.deepEqual([calls, ledger.loads], before);
      assert.equal((await invoke("github/credential", { token: fakeToken }, { Origin: "https://evil.example" })).status, 403);
    });
    await t.test("MCP client to bridge to actual broker: safe tools, ownership, expiry, revocation and logs", async () => {
      const { createMcpServer } = await load("mcp/server");
      const { createBridge } = await load("mcp/bridge");
      const githubFetch = globalThis.fetch;
      const { POST } = await load("app/api/mcp/tools/route");
      globalThis.fetch = async (url, options) => String(url).endsWith("/api/mcp/tools")
        ? POST(new Request(url, options)) : githubFetch(url, options);
      const server = createMcpServer(createBridge("http://127.0.0.1:3000"));
      const client = new Client({ name: "test-client", version: "1" });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const logs = [];
      const originalWrite = process.stderr.write;
      process.stderr.write = chunk => { logs.push(String(chunk)); return true; };
      try {
        await server.connect(serverTransport); await client.connect(clientTransport);
        const tools = await client.listTools();
        assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ["ghost_capabilities", "ghost_github_read_repo", "ghost_github_create_issue", "ghost_demo_forbidden_action", "ghost_custom_read", "ghost_web3_balance", "ghost_web3_transfer"].sort());
        const { ghost, cap } = make(); const other = make();
        const args = { ghostId: ghost.id, capabilityId: cap.id, ...scope };
        const call = (name, input) => client.callTool({ name, arguments: input });
        const listed = await call("ghost_capabilities", { ghostId: ghost.id });
        assert.deepEqual(listed.structuredContent.capabilities.map(item => item.capabilityId), [cap.id]);
        assert.deepEqual(Object.keys(listed.structuredContent.capabilities[0]).sort(), ["capabilityId", "provider", "resource", "actions", "expiresAt"].sort());
        assert.equal((await call("ghost_github_read_repo", args)).structuredContent.name, "repo");
        assert.equal((await call("ghost_github_create_issue", { ...args, title: "test", body: "private body must not be logged" })).structuredContent.number, 1);
        const before = [calls, ledger.loads];
        for (const [name, input, code] of [
          ["ghost_demo_forbidden_action", args, "ACTION_NOT_ALLOWED"],
          ["ghost_github_read_repo", { ...args, ghostId: other.ghost.id }, "GHOST_MISMATCH"],
          ["ghost_github_read_repo", { ...args, repo: "other" }, "RESOURCE_NOT_ALLOWED"],
          ["ghost_github_read_repo", { ...args, action: "github.repo.delete" }, "INVALID_INPUT"],
          ["get_secret", { token: fakeToken }, "UNKNOWN_TOOL"],
          ["ghost_capabilities", { ghostId: fakeToken }, "INVALID_INPUT"],
        ]) {
          const result = await call(name, input); assert.equal(result.isError, true);
          assert.deepEqual(result.structuredContent, { success: false, error: code });
        }
        assert.deepEqual([calls, ledger.loads], before);
        caps.revokeCapability(cap.id);
        assert.deepEqual((await call("ghost_capabilities", { ghostId: ghost.id })).structuredContent, { capabilities: [] });
        assert.equal((await call("ghost_github_read_repo", args)).structuredContent.error, "CAPABILITY_REVOKED");
        const short = make(undefined, 1); now += 1000;
        assert.deepEqual((await call("ghost_capabilities", { ghostId: short.ghost.id })).structuredContent, { capabilities: [] });
        assert.equal((await call("ghost_github_read_repo", { ...scope, ghostId: short.ghost.id, capabilityId: short.cap.id })).structuredContent.error, "CAPABILITY_EXPIRED");
        ghosts.expireGhostIdentity(other.ghost.id);
        assert.equal((await call("ghost_capabilities", { ghostId: other.ghost.id })).structuredContent.error, "GHOST_EXPIRED");
        assert.equal(logs.join("").includes(fakeToken), false);
        assert.equal(logs.join("").includes("private body"), false);
        assert.equal(logs.join("").includes(cap.id), false);
        assert.ok(logs.some(line => { const event = JSON.parse(line); return event.agent === ghost.id && event.reason === "ACTION_NOT_ALLOWED"; }));
      } finally {
        process.stderr.write = originalWrite;
        globalThis.fetch = githubFetch;
        await client.close(); await server.close();
      }
    });
    await t.test("MCP bridge rejects remote targets and strips unexpected responses", async () => {
      const { createBridge, brokerUrl } = await load("mcp/bridge");
      for (const url of ["https://example.com", "http://evil.example", "http://user:password@127.0.0.1", "http://127.0.0.1/?secret=x", "http://127.0.0.1/path"]) {
        assert.throws(() => brokerUrl(url), { code: "BROKER_UNAVAILABLE" });
      }
      const previous = globalThis.fetch;
      const bridge = createBridge("http://localhost:3000");
      try {
        globalThis.fetch = async () => Response.json({ name: "repo", description: null, private: false, defaultBranch: "main", token: fakeToken });
        assert.deepEqual(await bridge("ghost_github_read_repo", {}), { name: "repo", description: null, private: false, defaultBranch: "main" });
        globalThis.fetch = async () => Response.json({ error: fakeToken, stack: fakeToken }, { status: 500 });
        await assert.rejects(bridge("ghost_github_read_repo", {}), { code: "INTERNAL_ERROR" });
        globalThis.fetch = async () => new Response(fakeToken);
        await assert.rejects(bridge("ghost_github_read_repo", {}), { code: "BROKER_INVALID_RESPONSE" });
      } finally { globalThis.fetch = previous; }
    });
    await t.test("upstream errors and reflected credentials never escape", async () => {
      const { cap } = make();
      globalThis.fetch = async () => { throw new Error(fakeToken); };
      const response = await invoke("github/repo", { ...scope, capabilityId: cap.id });
      assert.deepEqual(await response.json(), { success: false, error: "GITHUB_REQUEST_FAILED" });
      globalThis.fetch = async () => Response.json({ name: fakeToken });
      await assert.rejects(client.getRepository({ ...scope, capabilityId: cap.id }), { code: "GITHUB_INVALID_RESPONSE" });
    });
    await awsTests(t, load, { advance: ms => { now += ms; } });
    await customTests(t, load, { advance: ms => { now += ms; } });
    await web3Tests(t, load, { advance: ms => { now += ms; } });
  } finally {
    delete globalThis.ghostkeyAws;
    delete globalThis.ghostkeyCustom;
    delete globalThis.ghostkeyWeb3;
    Date.now = originalNow; globalThis.fetch = originalFetch;
    delete globalThis.ghostkeyM2;
    await rm(root, { recursive: true, force: true });
  }
});
