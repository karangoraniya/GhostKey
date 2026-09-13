import "server-only";
import { BrokerError } from "@/lib/broker/errors";
import { KeyRingError } from "@/lib/ledger/errors";

// All MVP endpoints are local operator endpoints, not an authentication boundary.
export function localRoute(handler: (body: Record<string, unknown>) => unknown | Promise<unknown>) {
  return async (request: Request) => {
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    try {
      const url = new URL(request.url);
      const host = request.headers.get("host") ?? url.host;
      const target = new URL(`${url.protocol}//${host}`);
      if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new BrokerError("LOCAL_ONLY");
      const origin = request.headers.get("origin");
      if (origin && origin !== target.origin) throw new BrokerError("ORIGIN_NOT_ALLOWED");
      if (request.headers.get("sec-fetch-site") === "cross-site") throw new BrokerError("ORIGIN_NOT_ALLOWED");
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new BrokerError("JSON_REQUIRED", 415);
      const reader = request.body?.getReader();
      if (!reader) throw new BrokerError("INVALID_INPUT", 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) { await reader.cancel(); throw new BrokerError("BODY_TOO_LARGE", 413); }
        chunks.push(value);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { throw new BrokerError("INVALID_JSON", 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new BrokerError("INVALID_INPUT", 400);
      return json(await handler(body));
    } catch (error) {
      if (error instanceof BrokerError) return json({ success: false, error: error.code }, error.status);
      if (error instanceof KeyRingError) return json({ success: false, error: error.code }, 503);
      return json({ success: false, error: "INTERNAL_ERROR" }, 500);
    }
  };
}
