import { localRoute } from "@/lib/http/localRoute";
import { storeAwsCredentials } from "@/lib/providers/aws/credentials";
export const runtime = "nodejs";
export const POST = localRoute(async body => {
  await storeAwsCredentials({ accessKeyId: body.accessKeyId, secretAccessKey: body.secretAccessKey, sessionToken: body.sessionToken, region: body.region });
  return { success: true };
});
