import "server-only";
import { serializeSignature, getAddress, type Hex } from "viem";
import { withLedger, DERIVATION_PATH } from "./dmk";
import { awaitDeviceAction } from "./deviceAction";
import { HardwareError } from "./hardwareErrors";
import type { createApprovalChallenge } from "@/lib/approvals/challenge";

export async function signApprovalChallenge(challenge: ReturnType<typeof createApprovalChallenge>, expectedAddress: Hex): Promise<Hex> {
  return withLedger(async (signer, address) => {
    if (getAddress(expectedAddress) !== address) throw new HardwareError("WRONG_SIGNER");
    const signature = await awaitDeviceAction(signer.signTypedData(DERIVATION_PATH, challenge, { skipOpenApp: true }), 120000, true);
    if (![0, 1, 27, 28].includes(signature.v)) throw new HardwareError("LEDGER_INVALID_RESPONSE");
    return serializeSignature({ r: signature.r, s: signature.s, yParity: (signature.v >= 27 ? signature.v - 27 : signature.v) as 0 | 1 });
  });
}
