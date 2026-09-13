"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AwsAction } from "@/types/broker";
import { api, explain, type Dashboard } from "./use-dashboard";

type Status = { configured: boolean; region: string | null; verifiedAt: string | null };
type Grant = { capabilityId: string; expiresAt: string; actions: AwsAction[]; ghostId: string; bucket: string };
type Listing = { objects: { key: string; size: number; lastModified: string | null }[]; truncated: boolean };
type ObjectResult = { key: string; contentType: string; size: number; text: string };
export function useAws(d: Dashboard) {
  const [status, setStatus] = useState<Status>();
  const [bucket, setBucket] = useState("");
  const [prefix, setPrefix] = useState("");
  const [key, setKey] = useState("");
  const [grant, setGrant] = useState<Grant>();
  const [listing, setListing] = useState<Listing>();
  const [object, setObject] = useState<ObjectResult>();
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const agent = d.demoGhost;
  const active = !!(agent && grant?.ghostId === agent.id && d.alive(agent.expiresAt) && d.alive(grant.expiresAt) && grant.bucket === bucket.trim());
  const refresh = useCallback(async () => { setStatus(await api<Status>("aws/status", {})); }, []);
  useEffect(() => {
    let mounted = true;
    void api<Status>("aws/status", {}).then(value => { if (mounted) setStatus(value); }).catch(() => { if (mounted) setError("AWS status unavailable. Refresh to retry."); });
    return () => { mounted = false; };
  }, []);
  const { now, addEvent } = d;
  useEffect(() => {
    if (grant && now && Date.parse(grant.expiresAt) <= now) addEvent({ id: `expired-${grant.capabilityId}`, label: "AWS authority expired", detail: "capability.expired", status: "EXPIRED", tone: "muted" });
  }, [grant, now, addEvent]);
  async function run(name: string, task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(name); setError("");
    try { await task(); }
    catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" && /^[A-Z_]+$/.test(cause.code) ? cause.code : "REQUEST_FAILED";
      setError(`${code} — ${explain(code)}`);
      if (["AWS_AUTH_FAILED", "AWS_BUCKET_NOT_ALLOWED", "AWS_REQUEST_FAILED"].includes(code)) setStatus(previous => previous ? { ...previous, verifiedAt: null } : previous);
      d.addEvent({ label: "AWS request rejected", detail: code, status: "FAILED", tone: "danger" });
    } finally { lock.current = false; setBusy(""); }
  }
  function create() { return run("grant", async () => {
    if (!agent || !d.alive(agent.expiresAt)) throw { code: "GHOST_EXPIRED" };
    const resource = bucket.trim();
    const result = await api<Omit<Grant, "ghostId" | "bucket">>("capabilities", { ghostId: agent.id, provider: "aws", bucket: resource, actions: ["aws.s3.list", "aws.s3.read"], ttlSeconds: 1800 });
    setGrant({ ...result, ghostId: agent.id, bucket: resource }); setListing(undefined); setObject(undefined); setBlocked(false);
    d.addEvent({ label: "AWS bucket authority granted", detail: "capability.created · aws", status: "SCOPED", tone: "success" });
  }); }
  function execute(action: "list" | "read" | "demo-blocked") { return run(action, async () => {
    if (!active || !grant) throw { code: "CAPABILITY_EXPIRED" };
    const scope = { ghostId: grant.ghostId, capabilityId: grant.capabilityId, bucket: grant.bucket };
    if (action === "demo-blocked") {
      setBlocked(false);
      try { await api("aws/s3/demo-blocked", scope); throw { code: "REQUEST_FAILED" }; }
      catch (cause) {
        if (!(cause && typeof cause === "object" && "code" in cause && cause.code === "ACTION_NOT_ALLOWED")) throw cause;
        setBlocked(true);
        d.addEvent({ label: "S3 delete blocked before AWS", detail: "aws.s3.delete · ACTION_NOT_ALLOWED", status: "BLOCKED", tone: "danger" });
      }
    } else {
      if (action === "list") { setListing(undefined); setListing(await api<Listing>("aws/s3/list", { ...scope, prefix: prefix || undefined })); }
      else { setObject(undefined); setObject(await api<ObjectResult>("aws/s3/read", { ...scope, key })); }
      d.addEvent({ label: action === "list" ? "S3 objects listed" : "S3 text object read", detail: `aws.s3.${action}`, status: "ALLOWED", tone: "success" });
      await refresh();
    }
  }); }
  function store(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
    let credentials: Record<string, string> | undefined = Object.fromEntries(["region", "accessKeyId", "secretAccessKey", "sessionToken"].map(name => [name, field(name).value]));
    // Secrets never enter React state, URLs, or browser storage. Clear DOM immediately.
    for (const name of ["accessKeyId", "secretAccessKey", "sessionToken"]) field(name).value = "";
    void run("store", async () => {
      try { await api("aws/credentials", credentials); await refresh();
        d.addEvent({ label: "AWS credentials protected", detail: "aws.credentials.stored", status: "PROTECTED", tone: "neutral" }); }
      finally { credentials = undefined; }
    });
  }
  return { status, bucket, setBucket, prefix, setPrefix, key, setKey, grant, listing, object, blocked, busy, error, active, agent, create, execute, store, refresh: () => run("status", refresh) };
}
export type AwsDashboard = ReturnType<typeof useAws>;
