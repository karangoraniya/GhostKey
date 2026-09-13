import { decryptSecret, encryptSecret, validateTestInput } from "@/lib/ledger/keyring";
import { KeyRingError } from "@/lib/ledger/errors";

export const runtime = "nodejs";

function json(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  // Local development endpoint: reject cross-origin browser requests before CLI work.
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // Next.js may reconstruct request.url with its bind address (127.0.0.1).
  // Host retains the address the browser actually requested (e.g. localhost).
  // Do not trust forwarded-host headers or allow arbitrary localhost origins/ports.
  const host = request.headers.get("host") ?? url.host;
  let sameOrigin = !origin;
  if (origin) {
    try {
      const browserOrigin = new URL(origin);
      sameOrigin = browserOrigin.origin === origin &&
        browserOrigin.protocol === url.protocol && browserOrigin.host === host;
    } catch { /* Malformed and opaque origins are rejected. */ }
  }
  if (!sameOrigin) {
    return json({ success: false, error: "Cross-origin requests are not allowed." }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ success: false, error: "Expected application/json." }, 415);
  }
  let body: unknown;
  try {
    // Bound the actual streamed body, not just the untrusted Content-Length header.
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) {
        await reader.cancel();
        return json({ success: false, error: "Request body is too large." }, 413);
      }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return json({ success: false, error: "Invalid JSON body." }, 400);
  }
  try {
    if (!body || typeof body !== "object") throw new KeyRingError("INVALID_INPUT");
    const { secret, keyName } = body as Record<string, unknown>;
    validateTestInput(secret, keyName);
    const encrypted = await encryptSecret({ value: secret, keyName: keyName as string });
    const decrypted = await decryptSecret({ encrypted, keyName: keyName as string });
    const roundTrip = decrypted === secret;
    // Never serialize payloads or CLI diagnostics, even when verification fails.
    return json({ success: roundTrip, roundTrip }, roundTrip ? 200 : 500);
  } catch (error) {
    if (error instanceof KeyRingError) {
      const status = error.code === "INVALID_INPUT" ? 400
        : ["CLI_NOT_INSTALLED", "KEYRING_NOT_INITIALIZED", "PASSWORD_REQUIRED"].includes(error.code) ? 503 : 502;
      return json({ success: false, code: error.code, error: error.message }, status);
    }
    return json({ success: false, error: "Key Ring test failed." }, 500);
  }
}
