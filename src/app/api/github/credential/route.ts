import { localRoute } from "@/lib/http/localRoute";
import { storeGitHubCredential } from "@/lib/providers/github/credentials";
import { text } from "@/lib/broker/validation";
export const runtime = "nodejs";
export const POST = localRoute(async body => {
  try { await storeGitHubCredential(text(body.token, 4096)); }
  finally { delete body.token; }
  return { success: true };
});
