import { z } from "zod";
import { isIP } from "node:net";
import { BrokerError } from "@/lib/broker/errors";

export const operationName = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
export const connectionId = z.string().regex(/^api_[a-f0-9]{48}$/);
const path = z.string().max(512).regex(/^\/[a-zA-Z0-9/_~.\-]*$/).refine(value => !value.includes("//") && !value.split("/").some(part => part === "." || part === ".."));
export const connectionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  baseUrl: z.string().max(512),
  auth: z.enum(["bearer", "header"]),
  headerName: z.string().optional(),
  secret: z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/),
  operations: z.array(z.object({ name: operationName, path }).strict()).min(1).max(20),
}).strict();
export function parseConnection(input: unknown) {
  const parsed = connectionSchema.safeParse(input);
  if (!parsed.success) throw new BrokerError("INVALID_CUSTOM_CONFIG", 400);
  const data = parsed.data;
  let url: URL;
  try { url = new URL(data.baseUrl); } catch { throw new BrokerError("CUSTOM_URL_NOT_ALLOWED", 400); }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash ||
      url.pathname !== "/" || isIP(url.hostname) || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname) ||
      /\.(localhost|local|internal|test|invalid|example)$/.test(url.hostname)) throw new BrokerError("CUSTOM_URL_NOT_ALLOWED", 400);
  // No host/cookie/proxy/authentication override via custom transport headers.
  const headerName = data.auth === "bearer" ? "Authorization" : data.headerName;
  if (data.auth === "header" && (!headerName || !/^(?:x-[a-z0-9-]{1,60}|api-key|apikey)$/i.test(headerName) || /^x-(?:forwarded|original|rewrite|host|http-method)/i.test(headerName))) throw new BrokerError("CUSTOM_HEADER_NOT_ALLOWED", 400);
  if (new Set(data.operations.map(op => op.name)).size !== data.operations.length) throw new BrokerError("INVALID_CUSTOM_CONFIG", 400);
  if ([data.name, url.origin, headerName!, ...data.operations.flatMap(op => [op.name, op.path])].some(value => value.includes(data.secret))) throw new BrokerError("INVALID_CUSTOM_CONFIG", 400);
  return { ...data, baseUrl: url.origin, headerName: headerName! };
}
export const executeSchema = z.object({ ghostId: z.string().regex(/^ghost_[a-f0-9]{48}$/), capabilityId: z.string().regex(/^cap_[a-f0-9]{64}$/), connectionId, operation: operationName }).strict();
