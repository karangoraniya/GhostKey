import { localRoute } from "@/lib/http/localRoute";
import { createAgentWallet } from "@/lib/providers/web3/wallets";
export const runtime = "nodejs";
export const POST = localRoute(body => createAgentWallet(body));
