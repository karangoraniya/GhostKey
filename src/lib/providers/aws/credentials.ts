import "server-only";
import { encryptSecret, decryptSecret } from "@/lib/ledger/keyring";
import { BrokerError } from "@/lib/broker/errors";
import { awsRegion } from "./validation";

type Stored = { access: string; secret: string; session?: string; region: string; verifiedAt?: string };
const memory = globalThis as typeof globalThis & { ghostkeyAws?: Stored };
function credential(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.length || value.length > max || !/^[\x21-\x7e]+$/.test(value)) throw new BrokerError("INVALID_INPUT", 400);
  return value;
}
export async function storeAwsCredentials(input: { accessKeyId: unknown; secretAccessKey: unknown; sessionToken?: unknown; region?: unknown }) {
  const region = awsRegion(input.region || process.env.AWS_REGION);
  const access = credential(input.accessKeyId, 128), secret = credential(input.secretAccessKey, 4096);
  const session = input.sessionToken === undefined || input.sessionToken === "" ? undefined : credential(input.sessionToken, 4096);
  // Ledger Key Ring remains the only secret protection primitive. Commit atomically.
  const encryptedAccess = await encryptSecret({ value: access, keyName: "ghostkey-aws-access-key" });
  const encryptedSecret = await encryptSecret({ value: secret, keyName: "ghostkey-aws-secret-key" });
  const encryptedSession = session ? await encryptSecret({ value: session, keyName: "ghostkey-aws-session-token" }) : undefined;
  memory.ghostkeyAws = { access: encryptedAccess, secret: encryptedSecret, session: encryptedSession, region };
}
export function awsStatus() {
  return { configured: !!memory.ghostkeyAws, region: memory.ghostkeyAws?.region ?? null, verifiedAt: memory.ghostkeyAws?.verifiedAt ?? null };
}
// Server provider dependency only. No route or MCP tool exports these values.
export async function loadAwsCredentialsForInternalUse() {
  const stored = memory.ghostkeyAws;
  if (!stored) throw new BrokerError("AWS_NOT_CONFIGURED", 503);
  const accessKeyId = await decryptSecret({ encrypted: stored.access, keyName: "ghostkey-aws-access-key" });
  const secretAccessKey = await decryptSecret({ encrypted: stored.secret, keyName: "ghostkey-aws-secret-key" });
  const sessionToken = stored.session ? await decryptSecret({ encrypted: stored.session, keyName: "ghostkey-aws-session-token" }) : undefined;
  return { region: stored.region, credentials: { accessKeyId, secretAccessKey, sessionToken },
    verified: () => { if (memory.ghostkeyAws === stored) stored.verifiedAt = new Date().toISOString(); } };
}
