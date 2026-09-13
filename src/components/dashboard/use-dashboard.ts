"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { githubActions, type GitHubAction, type Capability, type GitHubCapability, type GhostIdentity } from "@/types/broker";
import type { KeyRingStatus } from "@/types/keyring";
import type { DeviceStatus } from "@/types/approval";
import type { ApprovalResponse } from "@/lib/approvals/response";
import type { Tone } from "@/components/ui/primitives";

type Activity = { id: string; at: string; label: string; detail: string; status: string; tone: Tone };
type RepoResult = { name: string; description: string | null; private: boolean; defaultBranch: string };
type IssueResult = { number: number; title: string; state: string; owner: string; repo: string };
export const DEMO_RESOURCE = { owner: "darkwebdev2", repo: "ghost-protocol" } as const;
export const DEMO_TTL = 1800;
const explanations: Record<string, string> = {
  AWS_NOT_CONFIGURED: "Protect AWS credentials in Advanced Controls → AWS Configuration first.",
  AWS_AUTH_FAILED: "AWS rejected the credential. Replace it with an active demo credential.",
  AWS_BUCKET_NOT_ALLOWED: "AWS denied access. Check the single-bucket IAM policy.",
  AWS_OBJECT_TOO_LARGE: "Only text objects up to 1 MiB can be read.",
  AWS_OBJECT_NOT_TEXT: "Choose an uncompressed UTF-8 text object with a text content type.",
  AWS_REQUEST_FAILED: "S3 request failed. Check the bucket, object key, and bucket region.",
  DEVICE_NOT_CONNECTED: "Connect and unlock your Ledger device.", ETHEREUM_APP_REQUIRED: "Open the Ethereum app on your Ledger.",
  LEDGER_NOT_READY: "Connect your Ledger and open Ethereum before requesting authority.", DEVICE_BUSY: "Ledger is busy. Finish the current device operation, then refresh.",
  GHOST_EXPIRED: "This identity has expired. Create a new agent identity.", GHOST_NOT_FOUND: "Identity unavailable. The backend may have restarted; create a new identity.",
  CAPABILITY_EXPIRED: "This capability has expired. Grant fresh authority.", CAPABILITY_NOT_FOUND: "Capability unavailable. Create a new capability.",
  ACTION_NOT_ALLOWED: "This action is outside the granted authority.", RESOURCE_NOT_ALLOWED: "The repository does not match this capability.",
  LEDGER_REJECTED: "You rejected the request on Ledger. No authority was granted.", SIGNATURE_INVALID: "Signature verification failed. No authority was granted.",
  CREDENTIAL_NOT_CONFIGURED: "The operator needs to store the demo repository’s test PAT in Advanced Controls → Protected credential setup.", PASSWORD_REQUIRED: "Your backend needs its existing private WALLET_PASS setup.",
  GITHUB_UNAUTHORIZED: "The stored GitHub credential was rejected. Ask the operator to replace it in Advanced Controls.",
  GITHUB_FORBIDDEN: "The test PAT needs Issues write access to the demo repository.",
  GITHUB_NOT_FOUND: "The demo repository was not found or the stored PAT cannot access it.",
  ALREADY_GRANTED: "This agent already has active elevated authority for this repository.", APPROVAL_EXPIRED: "This approval expired. Request authority again.",
  TYPED_DATA_UNSUPPORTED: "This device could not review the typed-data request. No authority was granted.",
  REQUEST_FAILED: "The backend could not complete this request. Check the local server and try again.",
};
export function explain(code: string) { return explanations[code] ?? "The operation could not complete. Check the status and try again."; }
class ApiError extends Error { constructor(readonly code: string) { super(explain(code)); } }
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, body === undefined ? { cache: "no-store" } : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(typeof result.error === "string" && /^[A-Z_]+$/.test(result.error) ? result.error : result.code ?? "REQUEST_FAILED");
  return result as T;
}
export function useDashboard() {
  const [ghosts, setGhosts] = useState<GhostIdentity[]>([]);
  const [caps, setCaps] = useState<GitHubCapability[]>([]);
  const [selectedCap, setSelectedCap] = useState("");
  const [name, setName] = useState("claude-code");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [actions, setActions] = useState<GitHubAction[]>([...githubActions]);
  const [ghostTtl, setGhostTtl] = useState(1800);
  const [capTtl, setCapTtl] = useState(900);
  // Demo references are independent of editable advanced selections and old results.
  const [demoGhostId, setDemoGhostId] = useState("");
  const [demoCapId, setDemoCapId] = useState("");
  const [demoApprovalId, setDemoApprovalId] = useState("");
  const [demoIssue, setDemoIssue] = useState<IssueResult>();
  const [demoBlocked, setDemoBlocked] = useState(false);
  const [demoRunState, setDemoRunState] = useState<"idle" | "running" | "success" | "failed">("idle");
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState("");
  const [signingApprovalId, setSigningApprovalId] = useState("");
  const operationLock = useRef(false);
  const [error, setError] = useState<{ code: string; message: string }>();
  const [events, setEvents] = useState<Activity[]>([]);
  const eventIds = useRef(new Set<string>());
  const [blockedCount, setBlockedCount] = useState(0);
  const [ring, setRing] = useState<KeyRingStatus>();
  const [ringVerified, setRingVerified] = useState(false);
  const [device, setDevice] = useState<DeviceStatus>();
  const [deviceChecked, setDeviceChecked] = useState<string>();
  const [credentialStored, setCredentialStored] = useState(false);
  const [providerVerified, setProviderVerified] = useState(false);
  const [repoResult, setRepoResult] = useState<RepoResult>();
  const [issueResult, setIssueResult] = useState<IssueResult>();
  const [blocked, setBlocked] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalResponse[]>([]);
  const [pollError, setPollError] = useState(false);
  const ghost = ghosts.at(-1);
  const alive = (expiresAt: string) => Boolean(now && Date.parse(expiresAt) > now);
  const ghostActive = Boolean(ghost && alive(ghost.expiresAt));
  const activeGhostIds = new Set(ghosts.filter(g => alive(g.expiresAt)).map(g => g.id));
  const capActive = (cap: Capability) => alive(cap.expiresAt) && activeGhostIds.has(cap.ghostId);
  const currentCaps = caps.filter(cap => cap.ghostId === ghost?.id);
  const cap = currentCaps.find(c => c.id === selectedCap);
  const usable = Boolean(cap && capActive(cap));
  const approval = approvals.at(-1);
  const approvalPollIds = approvals.filter(a => ["PENDING", "APPROVED"].includes(a.status)).map(a => a.approvalId).join(",");
  const demoGhost = ghosts.find(g => g.id === demoGhostId);
  const demoCap = caps.find(c => c.id === demoCapId);
  const demoUsable = Boolean(demoCap && capActive(demoCap));
  const demoApproval = approvals.find(a => a.approvalId === demoApprovalId);
  const addEvent = useCallback((event: Omit<Activity, "id" | "at"> & { id?: string; at?: string }) => {
    const id = event.id ?? crypto.randomUUID();
    if (eventIds.current.has(id)) return;
    eventIds.current.add(id);
    setEvents(previous => [{ ...event, id, at: event.at ?? new Date().toISOString() }, ...previous].slice(0, 60));
  }, []);
  const receiveApproval = useCallback((data: ApprovalResponse) => {
    setApprovals(previous => previous.some(a => a.approvalId === data.approvalId) ? previous.map(a => a.approvalId === data.approvalId ?
      a.status !== "PENDING" && data.status === "PENDING" ? a : data : a) : [...previous, data]);
    if (data.capability) setCaps(previous => previous.some(c => c.id === data.capability?.id) ? previous : [...previous, data.capability!]);
    for (const event of data.events) {
      const status = event.event === "approval.approved" ? "LEDGER" : event.event === "approval.requested" ? "HIGH" : event.event === "capability.elevated" ? "5 MIN MAX" : event.event.includes("failed") ? "FAILED" : event.event.includes("reject") ? "REJECTED" : event.event.includes("expired") ? "EXPIRED" : "PENDING";
      const labels: Record<string, string> = { "approval.requested": "High-risk authority requested", "approval.ledger_started": "Ledger confirmation started", "approval.approved": "Hardware approval verified", "capability.elevated": "Temporary authority granted", "approval.rejected": "Approval rejected", "approval.failed": "Hardware approval failed", "approval.expired": "Approval expired", "capability.expired": "Elevated authority expired" };
      addEvent({ id: `${data.approvalId}:${event.event}`, at: event.at, label: labels[event.event] ?? event.event,
        detail: event.event, status, tone: ["PENDING", "HIGH"].includes(status) ? "warning" : ["REJECTED", "FAILED"].includes(status) ? "danger" : "neutral" });
    }
  }, [addEvent]);
  useEffect(() => {
    const timer = setInterval(() => {
      const time = Date.now(); setNow(time);
      for (const cap of caps) if (Date.parse(cap.expiresAt) <= time) addEvent({ id: cap.approvalId ? `${cap.approvalId}:capability.expired` : `${cap.id}:expired`,
        at: cap.expiresAt, label: "Authority expired", detail: "capability.expired", status: "EXPIRED", tone: "muted" });
    }, 1000);
    return () => clearInterval(timer);
  }, [caps, addEvent]);
  useEffect(() => {
    let active = true;
    // Let React's development mount/cleanup cycle settle before opening native USB.
    const timer = setTimeout(() => {
    void api<KeyRingStatus>("keyring/status").then(data => { if (active) setRing(data); }).catch(() => { if (active) setRing({ status: "error", cliAvailable: false, message: "Could not reach the backend." }); });
    void api<DeviceStatus>("ledger/device/status").then(data => { if (active) { setDevice(data); setDeviceChecked(new Date().toISOString()); } }).catch(() => { /* Show unverified until a successful refresh. */ });
    }, 100);
    return () => { active = false; clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (!approvalPollIds) return;
    let active = true;
    const timer = setInterval(() => {
      void Promise.all(approvalPollIds.split(",").map(id => api<ApprovalResponse>(`approvals/${id}`)))
        .then(results => { if (active) { results.forEach(receiveApproval); setPollError(false); } }).catch(() => { if (active) setPollError(true); });
    }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [approvalPollIds, receiveApproval]);
  async function run(task: string, work: () => Promise<void>) {
    if (operationLock.current) return;
    operationLock.current = true; setBusy(task); setError(undefined);
    try { await work(); }
    catch (cause) {
      const code = cause instanceof ApiError ? cause.code : "REQUEST_FAILED";
      setError({ code, message: explain(code) });
      addEvent({ label: "Request did not complete", detail: code, status: "FAILED", tone: "danger" });
    } finally { operationLock.current = false; setBusy(""); }
  }
  function createGhost() { return run("ghost", async () => {
    const inputName = name.trim();
  const data = await api<{ ghostId: string; expiresAt: string }>("ghosts", { name: inputName, ttlSeconds: ghostTtl });
    // Creation time is observed locally; the existing API returns ID + expiration only.
    setGhosts(previous => [...previous, { id: data.ghostId, name: inputName, createdAt: new Date().toISOString(), expiresAt: data.expiresAt }]);
    setSelectedCap(""); setNow(Date.now());
    addEvent({ label: "Ephemeral identity created", detail: "ghost.created", status: "ACTIVE", tone: "success" });
  }); }
  function createCap() { return run("capability", async () => {
    if (!ghost || !ghostActive) throw new ApiError("GHOST_EXPIRED");
    const resource = { owner: owner.trim().toLowerCase(), repo: repo.trim().toLowerCase() };
    const data = await api<{ capabilityId: string; expiresAt: string; actions: GitHubAction[] }>("capabilities", { ghostId: ghost.id, provider: "github", ...resource, actions, ttlSeconds: capTtl });
    setCaps(previous => [...previous, { id: data.capabilityId, ghostId: ghost.id, provider: "github", resource, actions: data.actions, expiresAt: data.expiresAt, createdAt: new Date().toISOString() }]);
    setSelectedCap(data.capabilityId); setNow(Date.now());
    addEvent({ label: "Scoped authority granted", detail: "capability.created", status: "ACTIVE", tone: "success" });
  }); }
  function createDemoAgent() { return run("demo-setup", async () => {
    setDemoIssue(undefined); setDemoBlocked(false); setDemoRunState("idle"); setDemoApprovalId("");
    // If only capability creation failed, retry against the already-created identity.
    let agent = !demoCap && demoGhost && alive(demoGhost.expiresAt) ? demoGhost : undefined;
    if (!agent) {
      setDemoCapId(""); setDemoGhostId("");
      const data = await api<{ ghostId: string; expiresAt: string }>("ghosts", { name: name.trim(), ttlSeconds: DEMO_TTL });
      agent = { id: data.ghostId, name: name.trim(), expiresAt: data.expiresAt, createdAt: new Date().toISOString() };
      setGhosts(previous => [...previous, agent!]); setDemoGhostId(agent.id);
      addEvent({ label: "Ephemeral identity created", detail: "ghost.created", status: "ACTIVE", tone: "success" });
    }
    try {
      const data = await api<{ capabilityId: string; expiresAt: string; actions: GitHubAction[] }>("capabilities", {
        ghostId: agent.id, provider: "github", ...DEMO_RESOURCE, actions: [...githubActions], ttlSeconds: DEMO_TTL,
      });
      const created: Capability = { id: data.capabilityId, ghostId: agent.id, provider: "github", resource: { ...DEMO_RESOURCE }, actions: data.actions, expiresAt: data.expiresAt, createdAt: new Date().toISOString() };
      setCaps(previous => [...previous, created]); setDemoCapId(created.id); setSelectedCap(created.id);
      setOwner(DEMO_RESOURCE.owner); setRepo(DEMO_RESOURCE.repo); setNow(Date.now());
      addEvent({ label: "Demo authority granted", detail: "capability.created", status: "30 MIN MAX", tone: "success" });
    } catch (cause) {
      if (cause instanceof ApiError && ["GHOST_EXPIRED", "GHOST_NOT_FOUND"].includes(cause.code)) setDemoGhostId("");
      throw cause;
    }
  }); }
  function storeCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("token") as HTMLInputElement;
    let token = input.value; input.value = "";
    // PAT never enters React state, persistent storage, results, or activity.
    void run("credential", async () => {
      try { await api("github/credential", { token }); setCredentialStored(true); setProviderVerified(false);
        addEvent({ label: "Credential protected by Key Ring", detail: "github.credential.stored", status: "PROTECTED", tone: "neutral" }); }
      finally { token = ""; }
    });
  }
  function provider(action: "read" | "issue" | "blocked", issue?: { title: string; body: string }, demo = false) { return run(demo ? `demo-${action}` : action, async () => {
    const target = demo ? demoCap : cap;
    if (!target || !capActive(target)) throw new ApiError("CAPABILITY_EXPIRED");
    const scope = { capabilityId: target.id, ...target.resource };
    if (action === "blocked") {
      setBlocked(false);
      if (demo) setDemoBlocked(false);
      try { await api("github/blocked-action", scope); throw new ApiError("REQUEST_FAILED"); }
      catch (cause) { if (!(cause instanceof ApiError) || cause.code !== "ACTION_NOT_ALLOWED") throw cause;
        setBlocked(true); setBlockedCount(count => count + 1);
        if (demo) setDemoBlocked(true);
        addEvent({ label: "Forbidden action intercepted", detail: "github.repo.delete · ACTION_NOT_ALLOWED", status: "BLOCKED", tone: "danger" }); }
    } else if (action === "read") {
      const data = await api<RepoResult>("github/repo", scope); setRepoResult(data); setProviderVerified(true);
      addEvent({ label: "Repository accessed", detail: "github.repo.read", status: "ALLOWED", tone: "success" });
    } else {
      if (demo) { setDemoRunState("running"); setDemoIssue(undefined); setDemoBlocked(false); }
      try {
      const data = await api<Omit<IssueResult, "owner" | "repo">>("github/issues", { ...scope, ...issue });
      setIssueResult({ ...data, ...target.resource }); setProviderVerified(true);
      if (demo) { setDemoIssue({ ...data, ...target.resource }); setDemoRunState("success"); }
      addEvent({ label: `Issue #${data.number} created`, detail: "github.issue.create", status: "ALLOWED", tone: "success" });
      } catch (cause) { if (demo) setDemoRunState("failed"); throw cause; }
    }
  }); }
  function refreshTrust() { return run("trust", async () => {
    const data = await api<DeviceStatus>("ledger/device/status"); setDevice(data); setDeviceChecked(new Date().toISOString());
    setRing(await api<KeyRingStatus>("keyring/status"));
  }); }
  function testRing() { return run("ring", async () => {
    const data = await api<{ success: boolean; roundTrip: boolean }>("keyring/test", { secret: "hello-ghostkey", keyName: "ghostkey-test" });
    if (!data.success || !data.roundTrip) throw new ApiError("REQUEST_FAILED");
    setRingVerified(true); setRing({ status: "connected", cliAvailable: true, message: "Encryption and decryption verified." });
    addEvent({ label: "Key Ring round-trip verified", detail: "keyring.test", status: "VERIFIED", tone: "neutral" });
  }); }
  function requestAuthority(demo = false) { return run("request", async () => {
    const target = demo ? demoGhost : ghost;
    if (!target || !alive(target.expiresAt)) throw new ApiError("GHOST_EXPIRED");
    const data = await api<ApprovalResponse>("approvals", { ghostId: target.id, requestedAction: "github.admin.write", resource: demo ? `${DEMO_RESOURCE.owner}/${DEMO_RESOURCE.repo}` : `${owner.trim()}/${repo.trim()}` });
    receiveApproval(data); if (demo) setDemoApprovalId(data.approvalId); setNow(Date.now());
  }); }
  function respondApproval(approve: boolean, target = approval) { return run(approve ? "ledger" : "reject", async () => {
    if (!target) return;
    // Bind to the actual pending request, not editable repository fields.
    const binding = { ghostId: target.ghostId, requestedAction: target.requestedAction, resource: target.resource };
    if (approve) setSigningApprovalId(target.approvalId);
    try {
    receiveApproval(await api<ApprovalResponse>(`approvals/${target.approvalId}/${approve ? "ledger-approve" : "reject"}`, binding));
    setNow(Date.now());
    } finally { if (approve) setSigningApprovalId(""); }
  }); }
  return { addEvent, ghosts, ghost, ghostActive, caps, currentCaps, cap, capActive, usable, selectedCap, setSelectedCap, name, setName, owner, setOwner, repo, setRepo,
    actions, setActions, now, busy, error, events, blockedCount, ring, ringVerified, device, deviceChecked, credentialStored, providerVerified,
    repoResult, issueResult, blocked, approval, pollError, alive, activeGhostIds, createGhost, createCap, storeCredential, provider, refreshTrust, testRing, requestAuthority, respondApproval,
    demoGhost, demoCap, demoUsable, demoIssue, demoBlocked, demoRunState, demoApproval, createDemoAgent, ghostTtl, setGhostTtl, capTtl, setCapTtl, signingApprovalId,
    dismissError: () => setError(undefined) };
}
export type Dashboard = ReturnType<typeof useDashboard>;
