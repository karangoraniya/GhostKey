import { localRoute } from "@/lib/http/localRoute";
import { validateCapability } from "@/lib/capabilities";
import { repository, text } from "@/lib/broker/validation";
import { BrokerError } from "@/lib/broker/errors";
export const runtime = "nodejs";
export const POST = localRoute(body => {
  // Policy-only demo. No deletion implementation, credential access, or GitHub call.
  validateCapability({ ...repository(body.owner, body.repo), capabilityId: text(body.capabilityId), provider: "github", action: "github.repo.delete" });
  throw new BrokerError("ACTION_NOT_ALLOWED");
});
