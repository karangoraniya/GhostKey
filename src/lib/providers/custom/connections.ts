import "server-only";
import { randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret } from "@/lib/ledger/keyring";
import { BrokerError } from "@/lib/broker/errors";
import { parseConnection } from "./config";

type Connection = Omit<ReturnType<typeof parseConnection>, "secret"> & { id: string; encrypted: string };
const memory = globalThis as typeof globalThis & { ghostkeyCustom?: Map<string, Connection> };
const store = memory.ghostkeyCustom ??= new Map();
export async function createConnection(input: unknown) {
  const config = parseConnection(input);
  if (store.size >= 20) throw new BrokerError("CUSTOM_CONNECTION_LIMIT", 409);
  const id = `api_${randomBytes(24).toString("hex")}`;
  // Separate Ledger key for every immutable connection; old grants cannot change hosts.
  const encrypted = await encryptSecret({ value: config.secret, keyName: `custom-${id.slice(4)}` });
  if (store.size >= 20) throw new BrokerError("CUSTOM_CONNECTION_LIMIT", 409);
  const { secret: _secret, ...safe } = config;
  void _secret;
  store.set(id, { ...safe, id, encrypted });
  return metadata(store.get(id)!);
}
function metadata(c: Connection) { return { id: c.id, name: c.name, baseUrl: c.baseUrl, operations: c.operations.map(op => ({ ...op, method: "GET" as const })) }; }
export function listConnections() { return [...store.values()].map(metadata); }
export function getConnection(id: string) {
  const c = store.get(id);
  if (!c) throw new BrokerError("CUSTOM_NOT_CONFIGURED", 404);
  return metadata(c);
}
// Only the provider calls this after policy and public-address validation.
export async function loadInternalAuthentication(id: string) {
  const c = store.get(id);
  if (!c) throw new BrokerError("CUSTOM_NOT_CONFIGURED", 404);
  return { header: c.headerName, bearer: c.auth === "bearer", secret: await decryptSecret({ encrypted: c.encrypted, keyName: `custom-${id.slice(4)}` }) };
}
