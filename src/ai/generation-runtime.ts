import type {
  GenerationOutcome,
  GenerationDiagnostics,
} from "./generation-observation";
export class GenerationFailure extends Error {
  constructor(
    readonly outcome: Exclude<GenerationOutcome, "success">,
    message: string,
    readonly diagnostics?: GenerationDiagnostics,
  ) {
    super(message);
    this.name = "GenerationFailure";
  }
}
export function abortFailure(signal: AbortSignal) {
  return signal.reason?.name === "TimeoutError"
    ? new GenerationFailure(
        "timeout",
        "Generation timed out. Nothing was saved.",
      )
    : new GenerationFailure(
        "cancelled",
        "Generation cancelled. Nothing was saved.",
      );
}
/** Bound settlement independently of whether a transport/provider cooperates with abort. */
export function abortableGeneration<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortFailure(signal));
      return;
    }
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(abortFailure(signal));
    };
    signal.addEventListener("abort", abort, { once: true });
    let pending: Promise<T>;
    try {
      pending = operation();
    } catch (error) {
      signal.removeEventListener("abort", abort);
      reject(signal.aborted ? abortFailure(signal) : error);
      return;
    }
    Promise.resolve(pending).then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(abortFailure(signal));
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(signal.aborted ? abortFailure(signal) : error);
      },
    );
  });
}
