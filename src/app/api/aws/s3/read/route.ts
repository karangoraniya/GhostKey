import { localRoute } from "@/lib/http/localRoute";
import { text } from "@/lib/broker/validation";
import { getS3Object } from "@/lib/providers/aws/client";
export const runtime = "nodejs";
export const POST = localRoute(body => getS3Object({ ghostId: text(body.ghostId), capabilityId: text(body.capabilityId), bucket: text(body.bucket), key: text(body.key, 1024) }));
