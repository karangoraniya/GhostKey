import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server";
import { brokerUrl, createBridge } from "./bridge";

async function main() {
  // This process needs no Ledger/GitHub credentials. Keep them in the broker backend.
  delete process.env.WALLET_PASS;
  const server = createMcpServer(createBridge(brokerUrl(process.env.GHOSTKEY_BROKER_URL)));
  const transport = new StdioServerTransport();
  server.onerror = () => { process.stderr.write('{"result":"blocked","reason":"MCP_PROTOCOL_ERROR"}\n'); };
  process.once("SIGINT", () => { void server.close(); });
  process.once("SIGTERM", () => { void server.close(); });
  await server.connect(transport);
}
void main().catch(() => {
  process.stderr.write('{"result":"blocked","reason":"MCP_START_FAILED"}\n');
  process.exitCode = 1;
});
