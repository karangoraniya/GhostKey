import "server-only";
import { validateCapability } from "@/lib/capabilities";
import { BrokerError } from "@/lib/broker/errors";
import { text } from "@/lib/broker/validation";
import { loadGitHubCredential } from "./credentials";
import type { GitHubAction } from "@/types/broker";

type Input = { owner: string; repo: string; capabilityId: string; ghostId?: string };
async function request(input: Input, action: GitHubAction, issue?: { title: string; body?: string }) {
  const policy = { ...input, provider: "github", action };
  validateCapability(policy); // Denials happen before decryption or any network call.
  let token: string | undefined = await loadGitHubCredential();
  let headers: Headers | undefined;
  try {
    // Decryption is asynchronous: recheck expiration/revocation immediately before fetch.
    validateCapability(policy);
    headers = new Headers({ Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10", "Content-Type": "application/json" });
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}${issue ? "/issues" : ""}`, {
      method: issue ? "POST" : "GET", headers, body: issue ? JSON.stringify(issue) : undefined,
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new BrokerError(response.status === 401 ? "GITHUB_UNAUTHORIZED" : response.status === 403 ? "GITHUB_FORBIDDEN" : response.status === 404 ? "GITHUB_NOT_FOUND" : "GITHUB_REQUEST_FAILED", 502);
    }
    const data = await response.json();
    // An allowlist prevents upstream diagnostics or unexpected fields reaching clients.
    const safe = issue ? { number: data.number, title: data.title, state: data.state }
      : { name: data.name, description: data.description, private: data.private, defaultBranch: data.default_branch };
    // Defense against an upstream field accidentally containing the credential.
    if (JSON.stringify(safe).includes(token)) throw new BrokerError("GITHUB_INVALID_RESPONSE", 502);
    return safe;
  } catch (error) {
    if (error instanceof BrokerError) throw error;
    throw new BrokerError("GITHUB_REQUEST_FAILED", 502);
  } finally {
    headers?.delete("Authorization");
    headers = undefined;
    token = undefined; // JS/runtime copies cannot be guaranteed erased from memory.
  }
}
export function getRepository(input: Input) { return request(input, "github.repo.read"); }
export function createIssue(input: Input & { title: string; body?: string }) {
  const title = text(input.title, 256);
  if (input.body !== undefined && (typeof input.body !== "string" || input.body.length > 10000)) throw new BrokerError("INVALID_INPUT", 400);
  return request(input, "github.issue.create", { title, body: input.body });
}
