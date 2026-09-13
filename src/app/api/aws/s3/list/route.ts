import { localRoute } from "@/lib/http/localRoute";
import { objectKey } from "@/lib/providers/aws/validation";
import { text } from "@/lib/broker/validation";
import { listS3Objects } from "@/lib/providers/aws/client";
export const runtime = "nodejs";
export const POST = localRoute(body => listS3Objects({ ghostId: text(body.ghostId), capabilityId: text(body.capabilityId), bucket: text(body.bucket), prefix: body.prefix === undefined ? undefined : objectKey(body.prefix, true) }));
