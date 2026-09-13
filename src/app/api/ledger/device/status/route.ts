import { getLedgerDeviceStatus } from "@/lib/ledger/dmk";
export const runtime = "nodejs";
export async function GET() {
  return Response.json(await getLedgerDeviceStatus(), { headers: { "Cache-Control": "no-store" } });
}
