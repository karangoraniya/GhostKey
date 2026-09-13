import { outputSchemas, safeErrorCode, type ErrorCode, type ToolName } from "./contracts";

export class McpToolError extends Error {
  constructor(public readonly code: ErrorCode) { super(code); }
}
export function brokerUrl(value = "http://127.0.0.1:3000"): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
    // Resolve localhost as a literal loopback address, never through external DNS.
    if (url.hostname === "localhost") url.hostname = "127.0.0.1";
    return url.origin;
  } catch { throw new McpToolError("BROKER_UNAVAILABLE"); }
}
export function createBridge(baseUrl: string) {
  const base = brokerUrl(baseUrl);
  return async (tool: ToolName, args: unknown): Promise<Record<string, unknown>> => {
    try {
      const response = await fetch(`${base}/api/mcp/tools`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, args }), redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(50_000),
      });
      const reader = response.body?.getReader();
      if (!reader) throw new McpToolError("BROKER_INVALID_RESPONSE");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1_048_576) { await reader.cancel(); throw new McpToolError("BROKER_INVALID_RESPONSE"); }
        chunks.push(value);
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { throw new McpToolError("BROKER_INVALID_RESPONSE"); }
      if (!response.ok) throw new McpToolError(safeErrorCode(data?.error));
      const safe = outputSchemas[tool].safeParse(data);
      if (!safe.success) throw new McpToolError("BROKER_INVALID_RESPONSE");
      return safe.data; // Schemas strip unexpected fields, including backend diagnostics.
    } catch (error) {
      if (error instanceof McpToolError) throw error;
      // Never forward HTTP errors, response bodies, URLs, or stack traces.
      throw new McpToolError("BROKER_UNAVAILABLE");
    }
  };
}
