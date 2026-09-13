import { hashTypedData, recoverTypedDataAddress, getAddress, type Hex, type TypedData } from "viem";
import type { Approval } from "@/types/approval";

// Off-chain development domain: 31337 identifies this demo, not an RPC network.
// No verifyingContract, permit, transaction, delegation, or spending authorization.
export function createApprovalChallenge(approval: Pick<Approval, "ghostId" | "requestedAction" | "resource" | "expiresAt" | "nonce">) {
  return {
    domain: { name: "GhostKey", version: "1", chainId: 31337 },
    primaryType: "GhostKeyApproval" as const,
    types: {
      EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }],
      GhostKeyApproval: [
        { name: "ghostId", type: "string" }, { name: "action", type: "string" },
        { name: "resource", type: "string" }, { name: "risk", type: "string" },
        { name: "expiresAt", type: "uint256" }, { name: "nonce", type: "bytes32" },
      ],
    },
    message: { ghostId: approval.ghostId, action: approval.requestedAction, resource: approval.resource,
      risk: "HIGH", expiresAt: Math.floor(Date.parse(approval.expiresAt) / 1000), nonce: approval.nonce },
  };
}
export async function verifyApprovalSignature(challenge: ReturnType<typeof createApprovalChallenge>, signature: Hex, expectedAddress: Hex) {
  const data = { ...challenge, types: challenge.types as TypedData };
  const digest = hashTypedData(data);
  const recovered = await recoverTypedDataAddress({ ...data, signature });
  return { valid: getAddress(recovered) === getAddress(expectedAddress), digest };
}
