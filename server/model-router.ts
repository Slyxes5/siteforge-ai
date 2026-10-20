import { ProviderError } from "./provider-error";
import { modelRoutingSchema, type ModelRouting } from "../src/ai/model-routing";

export interface RouterModel<I, O> {
  model: string;
  /** Call dispatch synchronously immediately before the single outbound transport. */
  invoke(input: I, signal: AbortSignal, dispatch: () => void): Promise<O>;
}
export interface ModelRouterOptions<I, O> {
  models: readonly RouterModel<I, O>[];
  validate(input: I): void;
  maxAttempts: number;
  attemptTimeoutMs: number;
  totalTimeoutMs: number;
  delayMs?: number;
}
export class ModelRouterTimeout extends Error {
  readonly code = "ROUTER_TIMEOUT";
  constructor() {
    super("Model router deadline exceeded.");
  }
}
/** A rejected HTTP response is distinct from ambiguous network/body/deadline failure. */
export function createModelRouter<I, O>(
  configuration: ModelRouterOptions<I, O>,
) {
  const options = { ...configuration };
  const models = options.models.map((model) => ({ ...model }));
  if (
    !models.length ||
    models.length > 4 ||
    new Set(models.map((m) => m.model)).size !== models.length ||
    models.some((m) => !/^[a-z0-9][a-z0-9.-]{0,99}$/.test(m.model)) ||
    !Number.isInteger(options.maxAttempts) ||
    options.maxAttempts < 1 ||
    options.maxAttempts > 2 ||
    !Number.isInteger(options.attemptTimeoutMs) ||
    options.attemptTimeoutMs < 1 ||
    !Number.isInteger(options.totalTimeoutMs) ||
    options.totalTimeoutMs < 1 ||
    options.totalTimeoutMs > 90000 ||
    !Number.isFinite(options.delayMs ?? 0) ||
    (options.delayMs ?? 0) < 0
  )
    throw new Error("Invalid model router configuration.");
  const limit = Math.min(models.length, options.maxAttempts);
  return {
    async run(
      input: I,
      signal: AbortSignal,
      onUpdate?: (routing: ModelRouting) => void,
      onDispatch?: () => void,
    ): Promise<{ model: string; value: O }> {
      signal.throwIfAborted();
      options.validate(input);
      const total = new AbortController();
      const relay = () => total.abort(signal.reason);
      signal.addEventListener("abort", relay, { once: true });
      const deadline = Date.now() + options.totalTimeoutMs;
      const totalTimer = setTimeout(
        () => total.abort(new ModelRouterTimeout()),
        options.totalTimeoutMs,
      );
      let outbound = 0;
      const routing: ModelRouting = {
        selectedModel: null,
        outboundRequests: 0,
        attempts: [],
      };
      let reason: ModelRouting["attempts"][number]["reason"] = "primary";
      const emit = () => {
        try {
          onUpdate?.(modelRoutingSchema.parse(routing));
        } catch {
          /* Telemetry cannot change routing. */
        }
      };
      try {
        for (let index = 0; index < limit; index++) {
          total.signal.throwIfAborted();
          if (Date.now() >= deadline) throw new ModelRouterTimeout();
          const current = models[index];
          const entry: ModelRouting["attempts"][number] = {
            model: current.model,
            reason,
            outcome: "pending",
            outbound: 0,
          };
          routing.attempts.push(entry);
          emit();
          const child = new AbortController();
          const abort = () => child.abort(total.signal.reason);
          total.signal.addEventListener("abort", abort, { once: true });
          const attemptDeadline = Math.min(
            deadline,
            Date.now() + options.attemptTimeoutMs,
          );
          const timer = setTimeout(
            () => child.abort(new ModelRouterTimeout()),
            Math.max(1, attemptDeadline - Date.now()),
          );
          let dispatched = false;
          const dispatch = () => {
            child.signal.throwIfAborted();
            total.signal.throwIfAborted();
            if (
              Date.now() >= attemptDeadline ||
              dispatched ||
              outbound >= options.maxAttempts
            )
              throw new Error("Model router dispatch budget exhausted.");
            dispatched = true;
            outbound++;
            onDispatch?.();
            entry.outbound = 1;
            routing.outboundRequests = outbound;
            emit();
          };
          try {
            const value = await new Promise<O>((resolve, reject) => {
              const cancelled = () => reject(child.signal.reason);
              child.signal.addEventListener("abort", cancelled, { once: true });
              Promise.resolve()
                .then(() => {
                  child.signal.throwIfAborted();
                  return current.invoke(input, child.signal, dispatch);
                })
                .then(resolve, reject)
                .finally(() =>
                  child.signal.removeEventListener("abort", cancelled),
                );
            });
            child.signal.throwIfAborted();
            total.signal.throwIfAborted();
            if (Date.now() >= attemptDeadline) throw new ModelRouterTimeout();
            entry.outcome = "returned";
            routing.selectedModel = current.model;
            emit();
            return { model: current.model, value };
          } catch (error) {
            entry.outcome =
              error instanceof ModelRouterTimeout
                ? "timeout"
                : signal.aborted
                  ? "cancelled"
                  : error instanceof ProviderError && error.code === "HTTP"
                    ? "http_rejected"
                    : error instanceof ProviderError &&
                        [
                          "INVALID_OUTPUT",
                          "REFUSAL",
                          "TOO_LARGE",
                          "REQUEST_CONTRACT",
                        ].includes(error.code)
                      ? "invalid_output"
                      : "ambiguous_error";
            if (error instanceof ProviderError && error.code === "HTTP")
              entry.providerStatus = error.status;
            emit();
            total.signal.throwIfAborted();
            const rejectedHttp =
              dispatched &&
              error instanceof ProviderError &&
              error.code === "HTTP" &&
              [429, 503].includes(error.status ?? 0);
            const safeTimeout =
              !dispatched && error instanceof ModelRouterTimeout;
            if ((!rejectedHttp && !safeTimeout) || index + 1 >= limit)
              throw error;
            reason = safeTimeout
              ? "pre_dispatch_timeout"
              : (error as ProviderError).status === 429
                ? "http_429"
                : "http_503";
            const delay =
              error instanceof ProviderError
                ? (error.retryAfterMs ?? options.delayMs ?? 100)
                : 0;
            if (
              !Number.isFinite(delay) ||
              delay < 0 ||
              Date.now() + delay >= deadline
            )
              throw new ModelRouterTimeout();
            if (delay > 0)
              await new Promise<void>((resolve, reject) => {
                const cancel = () => {
                  clearTimeout(wait);
                  total.signal.removeEventListener("abort", cancel);
                  reject(total.signal.reason);
                };
                const wait = setTimeout(() => {
                  total.signal.removeEventListener("abort", cancel);
                  resolve();
                }, delay);
                total.signal.addEventListener("abort", cancel, { once: true });
                if (total.signal.aborted) cancel();
              });
          } finally {
            clearTimeout(timer);
            total.signal.removeEventListener("abort", abort);
            child.abort(new Error("Model attempt closed."));
          }
        }
        throw new Error("Model router exhausted.");
      } finally {
        clearTimeout(totalTimer);
        signal.removeEventListener("abort", relay);
      }
    },
  };
}
