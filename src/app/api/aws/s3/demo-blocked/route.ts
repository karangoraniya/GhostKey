import { localRoute } from "@/lib/http/localRoute";
import { text } from "@/lib/broker/validation";
import { validateCapability } from "@/lib/capabilities";
import { BrokerError } from "@/lib/broker/errors";
export const runtime = "nodejs";
export const POST = localRoute(body => {
  validateCapability({ ghostId: text(body.ghostId), capabilityId: text(body.capabilityId), bucket: text(body.bucket), provider: "aws", action: "aws.s3.delete" });
  // Fail closed even if a future grant type includes this action. No AWS import.
  throw new BrokerError("ACTION_NOT_ALLOWED");
});
