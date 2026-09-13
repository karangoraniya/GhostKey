import { localRoute } from "@/lib/http/localRoute";
import { getRepository } from "@/lib/providers/github/client";
import { repository, text } from "@/lib/broker/validation";
export const runtime = "nodejs";
export const POST = localRoute(body => getRepository({ ...repository(body.owner, body.repo), capabilityId: text(body.capabilityId) }));
