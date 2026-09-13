import "server-only";
import type { Capability, GhostIdentity } from "@/types/broker";

// Share one process-local store across route bundles and development hot reloads.
// A server restart clears all authority and the encrypted credential.
type BrokerState = {
  ghosts: Map<string, GhostIdentity>;
  capabilities: Map<string, Capability>;
  revoked: Set<string>;
  encryptedGitHubToken?: string;
};
const globalState = globalThis as typeof globalThis & { ghostkeyM2?: BrokerState };
export const state: BrokerState = globalState.ghostkeyM2 ??= {
  ghosts: new Map(), capabilities: new Map(), revoked: new Set(),
};
