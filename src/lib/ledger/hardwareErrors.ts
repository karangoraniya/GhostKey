import { BrokerError } from "@/lib/broker/errors";
export class HardwareError extends BrokerError {
  constructor(code: string) { super(code, code === "DEVICE_BUSY" ? 409 : 503); }
}
export function hardwareError(error: unknown): HardwareError {
  if (error instanceof HardwareError) return error;
  // Ledger's documented Ethereum status word for physical user refusal.
  if (error && typeof error === "object" && "errorCode" in error && error.errorCode === "6985") return new HardwareError("LEDGER_REJECTED");
  return new HardwareError("LEDGER_SIGNING_FAILED");
}
