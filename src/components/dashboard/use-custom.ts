"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type Dashboard } from "./use-dashboard";
type Connection = { id: string; name: string; baseUrl: string; operations: { name: string; path: string; method: "GET" }[] };
type Grant = { capabilityId: string; expiresAt: string; actions: string[]; connectionId: string; ghostId: string; operation: string };
const messages: Record<string, string> = {
  INVALID_CUSTOM_CONFIG: "Check the name, secret, and operation lines. Use one name and exact path per line.",
  CUSTOM_URL_NOT_ALLOWED: "Use a public HTTPS origin on port 443, without a path or query. Private networks are blocked.",
  CUSTOM_HEADER_NOT_ALLOWED: "Use an API-key header such as X-Api-Key or Api-Key.",
  CUSTOM_NOT_CONFIGURED: "This connection is unavailable. Connections clear when the backend restarts.",
  CUSTOM_AUTH_FAILED: "The API rejected this credential or its permissions.",
  CUSTOM_NOT_JSON: "This operation must return uncompressed UTF-8 JSON.",
  CUSTOM_RESPONSE_TOO_LARGE: "The JSON response exceeds the 512 KiB limit.",
  CUSTOM_REDIRECT_BLOCKED: "This endpoint redirects. Configure its final HTTPS origin and path instead.",
  CUSTOM_UNSAFE_RESPONSE: "The API reflected the stored credential. GhostKey blocked the response.",
  CUSTOM_REQUEST_FAILED: "The API could not be reached securely or returned an error.",
};
export function useCustom(d: Dashboard) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selected, setSelected] = useState("");
  const [operationName, setOperationName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [grant, setGrant] = useState<Grant>();
  const [result, setResult] = useState<{ operation: string; data: unknown }>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const connection = connections.find(c => c.id === selected) ?? connections[0];
  const operation = connection?.operations.find(op => op.name === operationName) ?? connection?.operations[0];
  const agent = d.ghosts.find(g => g.id === agentId) ?? d.ghost;
  const active = !!(grant && agent && d.alive(agent.expiresAt) && d.alive(grant.expiresAt) && grant.ghostId === agent.id && grant.connectionId === connection?.id && grant.operation === operation?.name);
  useEffect(() => { void api<{ connections: Connection[] }>("custom/connections/list", {}).then(data => setConnections(data.connections)).catch(() => setError("Could not load custom connections.")); }, []);
  async function run(name: string, task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(name); setError("");
    try { await task(); }
    catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" && /^[A-Z_]+$/.test(cause.code) ? cause.code : "CUSTOM_REQUEST_FAILED";
      setError(`${code}: ${messages[code] ?? "Check your active agent and permission, then try again."}`);
      d.addEvent({ label: "Custom API request blocked", detail: code, status: "FAILED", tone: "danger" });
    } finally { lock.current = false; setBusy(""); }
  }
  function store(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    const form = event.currentTarget;
    const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    const config = { name: value("name"), baseUrl: value("baseUrl"), auth: value("auth"), headerName: value("headerName"), operations: value("operations").trim().split(/\n/).map(line => { const [name, path, extra] = line.trim().split(/\s+/); return { name, path: extra ? "" : path }; }) };
    let secret = value("secret"); (form.elements.namedItem("secret") as HTMLInputElement).value = "";
    void run("store", async () => {
      try { const data = await api<Connection>("custom/connections", { ...config, secret }); setConnections(previous => [...previous, data]); setSelected(data.id); setResult(undefined);
        d.addEvent({ label: "Custom API connection protected", detail: "custom.connection.created", status: "PROTECTED", tone: "neutral" }); }
      finally { secret = ""; }
    });
  }
  function createGrant() { return run("grant", async () => {
    if (!connection || !operation || !agent || !d.alive(agent.expiresAt)) throw { code: "GHOST_EXPIRED" };
    const cap = await api<Omit<Grant, "connectionId" | "ghostId" | "operation">>("capabilities", { provider: "custom", connectionId: connection.id, ghostId: agent.id, actions: [`custom.read.${operation.name}`], ttlSeconds: 900 });
    setGrant({ ...cap, connectionId: connection.id, ghostId: agent.id, operation: operation.name }); setResult(undefined);
    d.addEvent({ label: "Custom API permission granted", detail: "capability.created · custom", status: "15 MIN MAX", tone: "success" });
  }); }
  function execute() { return run("execute", async () => {
    if (!grant || !active) throw { code: "CAPABILITY_EXPIRED" };
    setResult(undefined);
    const data = await api<{ operation: string; data: unknown }>("custom/execute", { ghostId: grant.ghostId, capabilityId: grant.capabilityId, connectionId: grant.connectionId, operation: grant.operation });
    setResult(data); d.addEvent({ label: "Custom API operation completed", detail: "custom.read", status: "ALLOWED", tone: "success" });
  }); }
  return { connections, connection, selected, setSelected, operation, setOperationName, agent, setAgentId, grant, active, result, busy, error, store, createGrant, execute };
}
export type CustomDashboard = ReturnType<typeof useCustom>;
