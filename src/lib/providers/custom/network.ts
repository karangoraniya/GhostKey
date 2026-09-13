import "server-only";
import { resolve4 } from "node:dns/promises";
import { BlockList, isIPv4 } from "node:net";
import { request } from "node:https";
import type { IncomingMessage } from "node:http";
import { BrokerError } from "@/lib/broker/errors";

const denied = new BlockList();
for (const [address, prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["192.88.99.0",24],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]] as const) denied.addSubnet(address, prefix, "ipv4");
export function publicIpv4(address: string) { return isIPv4(address) && !denied.check(address, "ipv4"); }
export async function resolvePublicAddress(host: string, resolve = resolve4) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([resolve(host), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error()), 5000); })]);
    if (!addresses.length || addresses.some(address => !publicIpv4(address))) throw new BrokerError("CUSTOM_URL_NOT_ALLOWED", 400);
    return addresses[0];
  } catch (error) { if (error instanceof BrokerError) throw error; throw new BrokerError("CUSTOM_REQUEST_FAILED", 502); }
  finally { clearTimeout(timer); }
}
export const MAX_JSON_BYTES = 512 * 1024;
export async function readJson(response: IncomingMessage) {
  if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) throw new BrokerError("CUSTOM_REDIRECT_BLOCKED", 502);
  if (response.statusCode === 401 || response.statusCode === 403) throw new BrokerError("CUSTOM_AUTH_FAILED", 502);
  if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) throw new BrokerError("CUSTOM_REQUEST_FAILED", 502);
  if (!/^application\/(?:[a-z0-9.-]+\+)?json(?:\s*;|$)/i.test(response.headers["content-type"] ?? "") ||
      (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity")) throw new BrokerError("CUSTOM_NOT_JSON", 415);
  if (Number(response.headers["content-length"] ?? 0) > MAX_JSON_BYTES) throw new BrokerError("CUSTOM_RESPONSE_TOO_LARGE", 413);
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of response) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > MAX_JSON_BYTES) throw new BrokerError("CUSTOM_RESPONSE_TOO_LARGE", 413); chunks.push(buffer); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) as unknown; }
  catch { throw new BrokerError("CUSTOM_NOT_JSON", 415); }
}
export function requestJson(url: URL, address: string, headers: Record<string, string>, makeRequest: typeof request = request): Promise<unknown> {
  // Pin the validated IPv4 at socket lookup while preserving the original TLS hostname.
  // Native HTTPS never follows redirects, uses no environment proxy, and verifies TLS.
  return new Promise((resolve, reject) => {
    let response: IncomingMessage | undefined;
    const req = makeRequest(url, { method: "GET", headers, agent: false, family: 4, rejectUnauthorized: true,
      lookup: (_host, _options, callback) => callback(null, address, 4) }, incoming => {
      response = incoming;
      void readJson(incoming).then(resolve, reject).finally(() => { clearTimeout(timer); incoming.destroy(); req.destroy(); });
    });
    const timer = setTimeout(() => { response?.destroy(); req.destroy(new BrokerError("CUSTOM_REQUEST_FAILED", 502)); }, 15000);
    req.on("error", error => { clearTimeout(timer); response?.destroy(); reject(error instanceof BrokerError ? error : new BrokerError("CUSTOM_REQUEST_FAILED", 502)); });
    req.end();
  });
}
