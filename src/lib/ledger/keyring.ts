import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeyRingStatus } from "@/types/keyring";
import { runRing } from "./cli";
import { KeyRingError } from "./errors";

export function validateTestInput(value: unknown, keyName: unknown): asserts value is string {
  if (typeof value !== "string" || !value.length || Buffer.byteLength(value) > 4096 ||
      typeof keyName !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(keyName)) {
    throw new KeyRingError("INVALID_INPUT");
  }
}

async function transform(operation: "encrypt" | "decrypt", input: Buffer, keyName: string) {
  const failure = operation === "encrypt" ? "ENCRYPTION_FAILED" : "DECRYPTION_FAILED";
  let directory: string | undefined;
  try {
    // mkdtemp creates a private 0700 directory outside the project. Plaintext input
    // uses stdin; JSON mode requires an output file, including for decryption.
    directory = await mkdtemp(join(tmpdir(), "ghostkey-"));
    const output = join(directory, "output");
    await writeFile(output, Buffer.alloc(0), { mode: 0o600 });
    await runRing([operation, "--key", keyName, "--out", output], input, failure);
    return await readFile(output);
  } catch (error) {
    throw error instanceof KeyRingError ? error : new KeyRingError(failure);
  } finally {
    input.fill(0);
    if (directory) {
      try { await rm(directory, { recursive: true, force: true }); }
      catch { throw new KeyRingError(failure); }
    }
  }
}

export async function encryptSecret({ value, keyName }: { value: string; keyName: string }) {
  validateTestInput(value, keyName);
  const encrypted = await transform("encrypt", Buffer.from(value, "utf8"), keyName);
  return encrypted.toString("base64");
}

export async function decryptSecret({ encrypted, keyName }: { encrypted: string; keyName: string }) {
  validateTestInput("validation", keyName);
  if (!encrypted || encrypted.length > 16_384 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encrypted)) {
    throw new KeyRingError("DECRYPTION_FAILED");
  }
  const plaintext = await transform("decrypt", Buffer.from(encrypted, "base64"), keyName);
  try { return plaintext.toString("utf8"); }
  finally { plaintext.fill(0); }
}

export async function getKeyRingStatus(): Promise<KeyRingStatus> {
  try {
    // Read-only local check: no init, device approval, encryption, or key creation.
    await runRing(["keys"], Buffer.alloc(0), "STATUS_FAILED");
    return { status: "connected", cliAvailable: true,
      message: "CLI available and local Key Ring initialized. Run the test to verify encryption." };
  } catch (error) {
    const safe = error instanceof KeyRingError ? error : new KeyRingError("STATUS_FAILED");
    return {
      status: ["CLI_NOT_INSTALLED", "KEYRING_NOT_INITIALIZED", "PASSWORD_REQUIRED"].includes(safe.code)
        ? "not_configured" : "error",
      cliAvailable: safe.code !== "CLI_NOT_INSTALLED",
      message: safe.message,
    };
  }
}
