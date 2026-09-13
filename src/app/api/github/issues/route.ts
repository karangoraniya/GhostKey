import { localRoute } from "@/lib/http/localRoute";
import { createIssue } from "@/lib/providers/github/client";
import { repository, text } from "@/lib/broker/validation";
import { BrokerError } from "@/lib/broker/errors";
export const runtime = "nodejs";
export const POST = localRoute(body => {
  if (body.body !== undefined && typeof body.body !== "string") throw new BrokerError("INVALID_INPUT", 400);
  return createIssue({ ...repository(body.owner, body.repo), capabilityId: text(body.capabilityId), title: text(body.title, 256), body: body.body as string | undefined });
});
