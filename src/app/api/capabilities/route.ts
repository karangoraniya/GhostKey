import { web3ResourceSchema, web3Actions, web3Input } from "@/lib/providers/web3/config";
import { z } from "zod";
import { localRoute } from "@/lib/http/localRoute";
import { createCapability } from "@/lib/capabilities";
import { BrokerError } from "@/lib/broker/errors";
import { repository, text, ttl } from "@/lib/broker/validation";
import { awsActions, type CustomAction, type AwsAction, githubActions, type GitHubAction } from "@/types/broker";
export const runtime = "nodejs";
export const POST = localRoute(body => {
  if (body.provider === "web3") {
    const input = web3Input(web3ResourceSchema.extend({ provider: z.literal("web3"), ghostId: z.string(), actions: z.array(z.enum(web3Actions)).min(1), ttlSeconds: z.number() }).strict(), body);
    const { provider, ghostId, actions, ttlSeconds, ...resource } = input;
    const cap = createCapability({ provider, ghostId, actions, ttlSeconds, resource });
    return { capabilityId: cap.id, expiresAt: cap.expiresAt, actions: cap.actions };
  }
  if (body.provider === "custom") {
    if (!Array.isArray(body.actions) || body.actions.some(action => typeof action !== "string" || !/^custom\.read\.[a-z][a-z0-9_-]{0,39}$/.test(action))) throw new BrokerError("ACTION_NOT_ALLOWED");
    const cap = createCapability({ ghostId: text(body.ghostId), provider: "custom", connectionId: text(body.connectionId), actions: body.actions as CustomAction[], ttlSeconds: ttl(body.ttlSeconds) });
    return { capabilityId: cap.id, expiresAt: cap.expiresAt, actions: cap.actions };
  }
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
