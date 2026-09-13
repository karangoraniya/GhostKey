import { localRoute } from "@/lib/http/localRoute";
import { createCapability } from "@/lib/capabilities";
import { BrokerError } from "@/lib/broker/errors";
import { repository, text, ttl } from "@/lib/broker/validation";
import { awsActions, type AwsAction, githubActions, type GitHubAction } from "@/types/broker";
export const runtime = "nodejs";
export const POST = localRoute(body => {
  if (body.provider === "aws") {
    if (!Array.isArray(body.actions) || body.actions.some(action => !awsActions.includes(action))) throw new BrokerError("ACTION_NOT_ALLOWED");
    const cap = createCapability({ ghostId: text(body.ghostId), provider: "aws", bucket: text(body.bucket), actions: body.actions as AwsAction[], ttlSeconds: ttl(body.ttlSeconds) });
    return { capabilityId: cap.id, expiresAt: cap.expiresAt, actions: cap.actions };
  }
  if (body.provider !== "github") throw new BrokerError("PROVIDER_NOT_ALLOWED");
  if (!Array.isArray(body.actions) || body.actions.some(action => !githubActions.includes(action))) throw new BrokerError("ACTION_NOT_ALLOWED");
  const cap = createCapability({ ghostId: text(body.ghostId), provider: "github", ...repository(body.owner, body.repo),
    actions: body.actions as GitHubAction[], ttlSeconds: ttl(body.ttlSeconds) });
  return { capabilityId: cap.id, expiresAt: cap.expiresAt, actions: cap.actions };
});
