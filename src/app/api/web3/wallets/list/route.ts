import { localRoute } from "@/lib/http/localRoute";
import { listAgentWallets } from "@/lib/providers/web3/wallets";
export const runtime = "nodejs";
export const POST = localRoute(() => ({ wallets: listAgentWallets() }));
