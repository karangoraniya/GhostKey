import { getKeyRingStatus } from "@/lib/ledger/keyring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getKeyRingStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}
