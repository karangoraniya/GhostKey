import "server-only";
import { spawn } from "node:child_process";
import { KeyRingError, type KeyRingErrorCode } from "./errors";

type Result = { status?: string; command?: string; ok?: boolean; error?: { message?: string } };

// This is the Ledger integration boundary. Never use a shell or pass secrets in argv.
// JSON output contains metadata only; payload bytes travel through stdin/files.
export function runRing(
  args: string[],
  input: Buffer,
  failure: KeyRingErrorCode,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("wallet-cli", ["ring", ...args, "--output", "json"], {
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let result: Result | undefined;
    let spawnError: NodeJS.ErrnoException | undefined;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (!child.pid) return;
      try {
        // wallet-cli is a Node wrapper around a native child: stop the whole group.
        if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch { /* The process may already have exited. */ }
    };
    const timeout = setTimeout(stop, 30_000);
    child.on("error", (error) => { spawnError = error; });
    child.stdin.on("error", () => { /* Early CLI errors can close stdin. */ });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length + chunk.length > 65_536) stop();
      else stderr += chunk.toString("utf8");
    });
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length + chunk.length > 65_536) { stop(); return; }
      stdout += chunk.toString("utf8");
      try {
        const parsed = JSON.parse(stdout) as Result;
        if (parsed && (parsed.ok === false ||
          (parsed.status === "success" && parsed.command === `ring ${args[0]}`))) {
          result = parsed;
          // v2.1.0 can linger after emitting its final JSON (background telemetry).
          // Allow final bookkeeping, then reap the process group before reading files.
          grace ??= setTimeout(stop, 1000);
        }
      } catch { /* Wait for a complete JSON envelope. */ }
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      clearTimeout(grace);
      if (spawnError?.code === "ENOENT") return reject(new KeyRingError("CLI_NOT_INSTALLED"));
      const diagnostic = `${result?.error?.message ?? ""}\n${stderr}`;
      if (/key ring not initialized/i.test(diagnostic)) {
        return reject(new KeyRingError("KEYRING_NOT_INITIALIZED"));
      }
      if (/password required|WALLET_PASS is not set/i.test(diagnostic)) {
        return reject(new KeyRingError("PASSWORD_REQUIRED"));
      }
      if (spawnError || !result || result.ok === false || (code !== 0 && code !== null)) {
        return reject(new KeyRingError(failure));
      }
      resolve();
    });
    child.stdin.end(input);
  });
}
