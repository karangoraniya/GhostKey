import "server-only";
import { encryptSecret, decryptSecret } from "@/lib/ledger/keyring";
import { state } from "@/lib/broker/state";
import { BrokerError } from "@/lib/broker/errors";

export async function storeGitHubCredential(token: string) {
  if (typeof token !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(token)) throw new BrokerError("INVALID_CREDENTIAL", 400);
  // Ledger integration: keep only ciphertext in process memory, never the PAT.
  state.encryptedGitHubToken = await encryptSecret({ value: token, keyName: "ghostkey-github" });
}

// Internal provider-only function. No route or broker exports a secret getter.
export async function loadGitHubCredential() {
  if (!state.encryptedGitHubToken) throw new BrokerError("CREDENTIAL_NOT_CONFIGURED", 503);
  return decryptSecret({ encrypted: state.encryptedGitHubToken, keyName: "ghostkey-github" });
}
