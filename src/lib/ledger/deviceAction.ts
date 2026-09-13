import { firstValueFrom, filter, map, timeout, type Observable } from "rxjs";
import { HardwareError, hardwareError } from "./hardwareErrors";

type ActionState<T> = { status: string; output?: T; error?: unknown; intermediateValue?: unknown };
export async function awaitDeviceAction<T>(action: { observable: Observable<ActionState<T>>; cancel: () => void }, milliseconds: number, typedSigning = false): Promise<T> {
  let completed = false;
  try {
    const output = await firstValueFrom(action.observable.pipe(
      map(state => {
        if (typedSigning && state.intermediateValue && typeof state.intermediateValue === "object" &&
            "step" in state.intermediateValue && state.intermediateValue.step === "signer.eth.steps.signTypedDataLegacy") {
          throw new HardwareError("TYPED_DATA_UNSUPPORTED"); // No hashed/blind legacy fallback.
        }
        if (state.status === "error") throw hardwareError(state.error);
        if (state.status === "stopped") throw new HardwareError("LEDGER_SIGNING_CANCELLED");
        return state;
      }),
      filter(state => state.status === "completed"),
      timeout({ first: milliseconds }),
      map(state => {
        if (state.output === undefined) throw new HardwareError("LEDGER_INVALID_RESPONSE");
        return state.output;
      }),
    ));
    completed = true;
    return output;
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new HardwareError("LEDGER_TIMEOUT");
    throw hardwareError(error);
  } finally {
    if (!completed) action.cancel();
  }
}
