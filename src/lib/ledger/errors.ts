export type KeyRingErrorCode =
  | "CLI_NOT_INSTALLED"
  | "KEYRING_NOT_INITIALIZED"
  | "PASSWORD_REQUIRED"
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED"
  | "STATUS_FAILED"
  | "INVALID_INPUT";

const messages: Record<KeyRingErrorCode, string> = {
  CLI_NOT_INSTALLED: "wallet-cli was not found. Install it and add it to the backend PATH.",
  KEYRING_NOT_INITIALIZED: "Key Ring is not initialized. Run wallet-cli ring init in your terminal.",
  PASSWORD_REQUIRED: "Key Ring requires a password supplied securely to the backend via WALLET_PASS.",
  ENCRYPTION_FAILED: "Ledger Key Ring encryption failed. Check your CLI configuration and network access.",
  DECRYPTION_FAILED: "Ledger Key Ring decryption failed. Check the key name, CLI configuration, and network access.",
  STATUS_FAILED: "Unable to check Ledger Key Ring status.",
  INVALID_INPUT: "Provide a non-empty secret up to 4096 bytes and a keyName using 1–64 letters, numbers, underscores, or hyphens.",
};

export class KeyRingError extends Error {
  constructor(public readonly code: KeyRingErrorCode) {
    super(messages[code]);
    this.name = "KeyRingError";
  }
}
