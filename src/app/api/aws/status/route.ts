import { localRoute } from "@/lib/http/localRoute";
import { awsStatus } from "@/lib/providers/aws/credentials";
export const runtime = "nodejs";
// POST uses the same local-only guard; status never decrypts or contacts AWS.
export const POST = localRoute(() => awsStatus());
