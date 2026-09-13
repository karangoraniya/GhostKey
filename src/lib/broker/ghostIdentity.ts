import "server-only";
import { randomBytes } from "node:crypto";
import { state } from "./state";
import { BrokerError } from "./errors";
import { text, ttl } from "./validation";

export function createGhostIdentity({ name, ttlSeconds }: { name: string; ttlSeconds: number }) {
  const now = Date.now();
  const ghost = { id: `ghost_${randomBytes(24).toString("hex")}`, name: text(name),
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + ttl(ttlSeconds) * 1000).toISOString() };
  state.ghosts.set(ghost.id, ghost);
  return { ...ghost };
}
export function getGhostIdentity(id: string) {
  const ghost = state.ghosts.get(id);
  if (!ghost) throw new BrokerError("GHOST_NOT_FOUND", 404);
  if (Date.parse(ghost.expiresAt) <= Date.now()) throw new BrokerError("GHOST_EXPIRED");
  return { ...ghost };
}
export function expireGhostIdentity(id: string) {
  const ghost = state.ghosts.get(id);
  if (!ghost) throw new BrokerError("GHOST_NOT_FOUND", 404);
  ghost.expiresAt = new Date(0).toISOString();
}
