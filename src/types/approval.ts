export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "FAILED";
export type ApprovalBinding = { ghostId: string; requestedAction: "github.admin.write"; resource: string };
export type Approval = ApprovalBinding & {
  id: string; risk: "HIGH"; status: ApprovalStatus; createdAt: string; expiresAt: string;
  nonce: `0x${string}`; walletAddress: `0x${string}`; signing: boolean;
  approvedAt?: string; capabilityId?: string; consumedAt?: string; error?: string;
};
export type DeviceStatus = {
  status: "READY" | "DEVICE_NOT_CONNECTED" | "ETHEREUM_APP_REQUIRED" | "BUSY" | "ERROR";
  deviceConnected: boolean; ethereumAppReady: boolean; address?: `0x${string}`;
  derivationPath: string; error?: string;
};
