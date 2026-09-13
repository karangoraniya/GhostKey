import "server-only";
import { validateCapability } from "@/lib/capabilities";
import { BrokerError } from "@/lib/broker/errors";
import { executeSchema } from "./config";
import { getConnection, loadInternalAuthentication } from "./connections";
import { resolvePublicAddress, requestJson } from "./network";

type Dependencies = { load: typeof loadInternalAuthentication; resolve: typeof resolvePublicAddress; request: typeof requestJson };
export function createCustomProvider(deps: Dependencies) {
  return async (raw: unknown) => {
    const parsed = executeSchema.safeParse(raw);
    if (!parsed.success) throw new BrokerError("INVALID_INPUT", 400);
    const input = parsed.data;
    const policy = { ...input, provider: "custom", action: `custom.read.${input.operation}` };
    validateCapability(policy);
    const connection = getConnection(input.connectionId);
    const operation = connection.operations.find(op => op.name === input.operation);
    if (!operation) throw new BrokerError("ACTION_NOT_ALLOWED");
    const url = new URL(operation.path, connection.baseUrl);
    const address = await deps.resolve(url.hostname); // No secrets before DNS safety checks.
    validateCapability(policy);
    let auth: Awaited<ReturnType<typeof deps.load>> | undefined = await deps.load(connection.id);
    const headers: Record<string, string> = { Accept: "application/json", "Accept-Encoding": "identity", "User-Agent": "GhostKey/1" };
    try {
      validateCapability(policy);
      headers[auth.header] = auth.bearer ? `Bearer ${auth.secret}` : auth.secret;
      const data = await deps.request(url, address, headers);
      validateCapability(policy);
      // Inspect decoded strings/keys too, so JSON escaping cannot hide reflected credentials.
      const pending: unknown[] = [data];
      while (pending.length) {
        const value = pending.pop();
        if (typeof value === "string" && value.includes(auth.secret)) throw new BrokerError("CUSTOM_UNSAFE_RESPONSE", 502);
        if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) pending.push(key, child);
      }
      return { operation: input.operation, data };
    } catch (error) { if (error instanceof BrokerError) throw error; throw new BrokerError("CUSTOM_REQUEST_FAILED", 502); }
    finally { for (const key of Object.keys(headers)) delete headers[key]; auth = undefined; }
  };
}
export const executeCustomOperation = createCustomProvider({ load: loadInternalAuthentication, resolve: resolvePublicAddress, request: requestJson });
