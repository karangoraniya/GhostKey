import { localRoute } from "@/lib/http/localRoute";
import { createGhostIdentity } from "@/lib/broker/ghostIdentity";
import { text, ttl } from "@/lib/broker/validation";
export const runtime = "nodejs";
export const POST = localRoute(body => {
  const ghost = createGhostIdentity({ name: text(body.name), ttlSeconds: ttl(body.ttlSeconds) });
  return { ghostId: ghost.id, expiresAt: ghost.expiresAt };
});
