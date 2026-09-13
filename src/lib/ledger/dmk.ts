import "server-only";
import { createRequire } from "node:module";
import { firstValueFrom, timeout } from "rxjs";
import { getAddress } from "viem";
import type { DeviceManagementKit, DeviceSessionId } from "@ledgerhq/device-management-kit";
import type { SignerEth } from "@ledgerhq/device-signer-kit-ethereum";
import type { DeviceStatus } from "@/types/approval";
import { awaitDeviceAction } from "./deviceAction";
import { HardwareError, hardwareError } from "./hardwareErrors";

// Explicit first Ethereum account. Key Ring/session files are never read for derivation secrets.
export const DERIVATION_PATH = "44'/60'/0'/0/0";
const shared = globalThis as typeof globalThis & { ghostkeyHardwareBusy?: boolean; ghostkeyDmk?: DeviceManagementKit };
// DMK 1.9's ESM build contains directory imports unsupported by native Node.
// Resolve the official CommonJS exports from the application's installed packages.
const requireLedger = createRequire(import.meta.url);

async function bounded<T>(work: Promise<T>, milliseconds = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HardwareError("LEDGER_TIMEOUT")), milliseconds);
  })]); } finally { clearTimeout(timer!); }
}
export async function withLedger<T>(work: (signer: SignerEth, address: `0x${string}`) => Promise<T>) {
  if (shared.ghostkeyHardwareBusy) throw new HardwareError("DEVICE_BUSY");
  shared.ghostkeyHardwareBusy = true;
  let dmk: DeviceManagementKit | undefined;
  let sessionId: DeviceSessionId | undefined;
  try {
    // Native Node HID USB transport. Nothing here runs in a browser.
    const kit: typeof import("@ledgerhq/device-management-kit") = requireLedger("@ledgerhq/device-management-kit");
    const transport: typeof import("@ledgerhq/device-transport-kit-node-hid") = requireLedger("@ledgerhq/device-transport-kit-node-hid");
    const ethereum: typeof import("@ledgerhq/device-signer-kit-ethereum") = requireLedger("@ledgerhq/device-signer-kit-ethereum");
    // close() closes sessions only; retain one transport to avoid accumulating USB listeners.
    dmk = shared.ghostkeyDmk ??= new kit.DeviceManagementKitBuilder().addTransport(transport.nodeHidTransportFactory).build();
    let device;
    try { device = await firstValueFrom(dmk.startDiscovering({}).pipe(timeout({ first: 3000 }))); }
    catch (error) {
      const absent = error instanceof Error && error.name === "TimeoutError" ||
        error && typeof error === "object" && "_tag" in error && error._tag === "NoAccessibleDeviceError";
      throw new HardwareError(absent ? "DEVICE_NOT_CONNECTED" : "LEDGER_DISCOVERY_FAILED");
    }
    const connection = dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
    try { sessionId = await bounded(connection); }
    catch (error) {
      // Clean up even if native connection resolves after our timeout.
      const activeKit = dmk;
      void connection.then(id => activeKit.disconnect({ sessionId: id })).catch(() => {});
      throw error;
    }
    await dmk.stopDiscovering();
    const app = await bounded(dmk.sendCommand({ sessionId, command: new kit.GetAppAndVersionCommand() }));
    if (!kit.isSuccessCommandResult(app) || app.data.name !== "Ethereum") throw new HardwareError("ETHEREUM_APP_REQUIRED");
    // Installed builder uses `dmk`, despite some online examples using `sdk`.
    const signer = new ethereum.SignerEthBuilder({ dmk, sessionId }).build();
    const account = await awaitDeviceAction(signer.getAddress(DERIVATION_PATH, {
      checkOnDevice: false, returnChainCode: false, skipOpenApp: true,
    }), 10000);
    return await work(signer, getAddress(account.address));
  } catch (error) { throw hardwareError(error); }
  finally {
    try {
      if (dmk) await bounded(Promise.resolve(dmk.stopDiscovering()), 3000).catch(() => {});
      if (dmk && sessionId) await bounded(dmk.disconnect({ sessionId }), 3000).catch(() => {});
    } finally {
      try { dmk?.close(); } finally { shared.ghostkeyHardwareBusy = false; }
    }
  }
}
export async function getLedgerDeviceStatus(): Promise<DeviceStatus> {
  try {
    return await withLedger(async (_, address) => ({ status: "READY", deviceConnected: true,
      ethereumAppReady: true, address, derivationPath: DERIVATION_PATH }));
  } catch (error) {
    const code = hardwareError(error).code;
    return { status: code === "DEVICE_NOT_CONNECTED" ? "DEVICE_NOT_CONNECTED" : code === "DEVICE_BUSY" ? "BUSY" : code === "ETHEREUM_APP_REQUIRED" ? "ETHEREUM_APP_REQUIRED" : "ERROR",
      deviceConnected: code === "ETHEREUM_APP_REQUIRED", ethereumAppReady: false,
      derivationPath: DERIVATION_PATH, error: code };
  }
}
