export type KeyRingStatus = {
  status: "connected" | "not_configured" | "error";
  cliAvailable: boolean;
  message: string;
};
