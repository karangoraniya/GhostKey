import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Real subprocess and MCP initialization/tool discovery, no real backend or credentials.
test("stdio MCP startup, tool discovery and safe errors", async () => {
  const client = new Client({ name: "ghostkey-stdio-test", version: "1" });
  const marker = "disposable-secret-marker";
  const transport = new StdioClientTransport({
    command: "npm",
    args: ["--silent", "run", "mcp"],
    env: { GHOSTKEY_BROKER_URL: "http://127.0.0.1:1", WALLET_PASS: marker },
    stderr: "pipe",
  });
  let logs = "";
  try {
    await client.connect(transport);
    transport.stderr?.on("data", chunk => { logs += chunk; });
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 7);
    for (const name of ["get_secret", "get_token", "export_credential", "decrypt_secret"]) {
      const result = await client.callTool({ name, arguments: {} });
      assert.equal(result.isError, true);
      assert.deepEqual(result.structuredContent, { success: false, error: "UNKNOWN_TOOL" });
    }
    const invalid = await client.callTool({ name: "ghost_capabilities", arguments: { ghostId: marker } });
    assert.deepEqual(invalid.structuredContent, { success: false, error: "INVALID_INPUT" });
    const unavailable = await client.callTool({ name: "ghost_capabilities", arguments: { ghostId: `ghost_${"a".repeat(48)}` } });
    assert.deepEqual(unavailable.structuredContent, { success: false, error: "BROKER_UNAVAILABLE" });
    assert.equal(JSON.stringify([listed, invalid, unavailable]).includes(marker), false);
  } finally {
    await client.close();
    assert.equal(logs.includes(marker), false);
  }
});
