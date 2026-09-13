import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

// Run the actual adapter and routes against a disposable CLI, without real credentials.
test("keyring adapter and API security boundaries", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ghostkey-tests-"));
  const originalPath = process.env.PATH;
  const originalTmp = process.env.TMPDIR;
  try {
    const bin = join(root, "bin");
    const temporary = join(root, "temporary");
    await mkdir(bin);
    await mkdir(temporary);
    process.env.TMPDIR = temporary;
    process.env.PATH = `${bin}:${originalPath}`;
    for (const [name, source] of Object.entries({
      errors: "src/lib/ledger/errors.ts", cli: "src/lib/ledger/cli.ts",
      keyring: "src/lib/ledger/keyring.ts", route: "src/app/api/keyring/test/route.ts",
    })) {
      const content = (await readFile(source, "utf8"))
        .replace('import "server-only";', "")
        .replaceAll('"./errors"', '"./errors.mjs"')
        .replaceAll('"./cli"', '"./cli.mjs"')
        .replaceAll('"@/lib/ledger/keyring"', '"./keyring.mjs"')
        .replaceAll('"@/lib/ledger/errors"', '"./errors.mjs"');
      await writeFile(join(root, `${name}.mjs`), ts.transpileModule(content, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      }).outputText);
    }
    const adapter = await import(pathToFileURL(join(root, "keyring.mjs")));
    const { POST } = await import(pathToFileURL(join(root, "route.mjs")));
    async function fixture(mode) {
      await writeFile(join(bin, "wallet-cli"), `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
const operation = args[1];
const mode = ${JSON.stringify(mode)};
let input = Buffer.alloc(0);
process.stdin.on("data", chunk => { input = Buffer.concat([input, chunk]); });
process.stdin.on("end", () => {
  const out = args[args.indexOf("--out") + 1];
  if (mode === "uninitialized" || mode === "password" || mode === "failure") {
    if (operation !== "keys") fs.writeFileSync(out, input, {mode: 0o600});
    const message = mode === "uninitialized" ? "Ledger Key Ring not initialized" : mode === "password" ? "Password required but no TTY available and WALLET_PASS is not set" : input.toString();
    console.log(JSON.stringify({ok: false, error: {message}}));
    process.exitCode = 1;
    return;
  }
  if (operation !== "keys") {
    const data = operation === "encrypt" ? Buffer.concat([Buffer.from([1]), input]) : input.subarray(1);
    fs.writeFileSync(out, mode === "mismatch" && operation === "decrypt" ? Buffer.from([0]) : data, {mode: 0o600});
  }
  console.log(JSON.stringify({status: "success", command: "ring " + operation}));
});
`, { mode: 0o700 });
    }
    const secret = ` \n${randomBytes(20).toString("hex")}🔑\n `;
    const keyName = "ghostkey-test";
    const request = (body, headers = { "Content-Type": "application/json" }) =>
      new Request("http://localhost:3000/api/keyring/test", { method: "POST", headers, body });
    const payload = JSON.stringify({ secret, keyName });
    await t.test("round-trip preserves bytes and API returns booleans only", async () => {
      await fixture("success");
      assert.equal((await adapter.getKeyRingStatus()).status, "connected");
      const encrypted = await adapter.encryptSecret({ value: secret, keyName });
      assert.equal(await adapter.decryptSecret({ encrypted, keyName }), secret);
      const response = await POST(request(payload));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true, roundTrip: true });
      assert.deepEqual(await readdir(temporary), []);
    });
    await t.test("browser Host is checked instead of the internal bind address", async () => {
      await fixture("success");
      const browserRequest = (origin, host = "localhost:3000") => new Request(
        "http://127.0.0.1:3000/api/keyring/test", {
          method: "POST", body: payload,
          headers: { "Content-Type": "application/json", Host: host, Origin: origin },
        },
      );
      assert.equal((await POST(browserRequest("http://localhost:3000"))).status, 200);
      assert.equal((await POST(browserRequest("http://127.0.0.1:3000", "127.0.0.1:3000"))).status, 200);
      for (const origin of ["https://example.com", "http://localhost:4000", "https://localhost:3000", "null", "http://127.0.0.1:3000"]) {
        assert.equal((await POST(browserRequest(origin))).status, 403);
      }
    });
    await t.test("safe configuration errors and cleanup after partial output", async () => {
      for (const [mode, code] of [["uninitialized", "KEYRING_NOT_INITIALIZED"], ["password", "PASSWORD_REQUIRED"], ["failure", "ENCRYPTION_FAILED"]]) {
        await fixture(mode);
        const response = await POST(request(payload));
        const result = await response.json();
        assert.equal(result.code, code);
        assert.equal(JSON.stringify(result).includes(secret), false);
        assert.deepEqual(await readdir(temporary), []);
      }
      await assert.rejects(adapter.decryptSecret({ encrypted: Buffer.from(secret).toString("base64"), keyName }), { code: "DECRYPTION_FAILED" });
      assert.deepEqual(await readdir(temporary), []);
    });
    await t.test("missing CLI and invalid requests", async () => {
      process.env.PATH = join(root, "missing");
      assert.deepEqual((await adapter.getKeyRingStatus()).cliAvailable, false);
      assert.equal((await POST(request(payload))).status, 503);
      for (const value of ["{", "null", JSON.stringify({ secret, keyName: "--bad key" }), JSON.stringify({ secret: "", keyName })]) {
        assert.equal((await POST(request(value))).status, 400);
      }
      assert.equal((await POST(request(payload, { "Content-Type": "text/plain" }))).status, 415);
      assert.equal((await POST(request(payload, { "Content-Type": "application/json", Origin: "https://example.com" }))).status, 403);
      assert.equal((await POST(request(" ".repeat(33_000)))).status, 413);
      assert.deepEqual(await readdir(temporary), []);
      process.env.PATH = `${bin}:${originalPath}`;
    });
    await t.test("mismatched plaintext is never returned", async () => {
      await fixture("mismatch");
      const response = await POST(request(payload));
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { success: false, roundTrip: false });
      assert.deepEqual(await readdir(temporary), []);
    });
  } finally {
    process.env.PATH = originalPath;
    if (originalTmp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = originalTmp;
    await rm(root, { recursive: true, force: true });
  }
});
