import {
  GENERATION_LIMITS,
  OPENROUTER_GENERATION_LIMITS,
  type WebsiteGenerationProvider,
} from "../src/ai/website-generation";
import type { OpenRouterOutputMode } from "./openrouter-request";
export interface OpenRouterOptions {
  apiKey: string;
  model?: string;
  outputMode?: OpenRouterOutputMode;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  responseBytes?: number;
}
import {
  buildOpenRouterRequestBody,
  OPENROUTER_FREE_MODEL,
} from "./openrouter-request";
import { ProviderError } from "./provider-error";
import type { GenerationProblem } from "../src/ai/generation-validation";
import type { ProviderTimings } from "../src/ai/generation-observation";
function invalid(reason: GenerationProblem["reason"]): ProviderError {
  return new ProviderError(
    reason === "PROVIDER_REFUSAL" ? "REFUSAL" : "INVALID_OUTPUT",
    undefined,
    undefined,
    { stage: "provider_envelope", reason },
  );
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function content(raw: string, model: string): string {
  if (!raw.trim()) throw invalid("EMPTY_RESPONSE");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw invalid("MALFORMED_ENVELOPE_JSON");
  }
  if (
    !object(data) ||
    "error" in data ||
    !Array.isArray(data.choices) ||
    data.choices.length !== 1 ||
    !object(data.choices[0])
  )
    throw invalid("INVALID_PROVIDER_ENVELOPE");
  if (
    "model" in data &&
    data.model !== model &&
    data.model !== model.slice(0, -5)
  )
    throw invalid("INVALID_PROVIDER_ENVELOPE");
  if (
    object(data.usage) &&
    "cost" in data.usage &&
    (typeof data.usage.cost !== "number" ||
      data.usage.cost > 0 ||
      data.usage.cost < 0)
  )
    throw invalid("INVALID_PROVIDER_ENVELOPE");
  const choice = data.choices[0];
  if ("error" in choice) throw invalid("INVALID_PROVIDER_ENVELOPE");
  if (choice.finish_reason === "length") throw invalid("OUTPUT_TRUNCATED");
  if (choice.finish_reason === "content_filter")
    throw invalid("PROVIDER_REFUSAL");
  if (choice.finish_reason !== "stop") throw invalid("PROVIDER_FINISH_REASON");
  const message = choice.message;
  if (!object(message) || message.role !== "assistant")
    throw invalid("INVALID_PROVIDER_ENVELOPE");
  if (message.refusal != null && message.refusal !== "")
    throw invalid("PROVIDER_REFUSAL");
  if ("tool_calls" in message || "function_call" in message)
    throw invalid("UNSUPPORTED_PROVIDER_PART");
  if (typeof message.content !== "string")
    throw invalid("INVALID_PROVIDER_ENVELOPE");
  if (!message.content.trim()) throw invalid("EMPTY_CONTENT");
  return message.content;
}
export function createOpenRouterProvider(
  options: OpenRouterOptions,
): WebsiteGenerationProvider {
  const model = options.model ?? OPENROUTER_FREE_MODEL;
  // Validate all configuration without touching environment or dispatching transport.
  buildOpenRouterRequestBody(
    { name: "validation", prompt: "validation" },
    model,
    options.outputMode,
  );
  if (
    typeof options.apiKey !== "string" ||
    !options.apiKey.trim() ||
    /[\r\n\x00-\x1f\x7f]/.test(options.apiKey)
  )
    throw new ProviderError("REQUEST_CONTRACT");
  const timeoutMs = options.timeoutMs ?? OPENROUTER_GENERATION_LIMITS.timeoutMs;
  const responseBytes =
    options.responseBytes ?? GENERATION_LIMITS.responseBytes;
  if (
    ![timeoutMs, responseBytes].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    ) ||
    timeoutMs > OPENROUTER_GENERATION_LIMITS.timeoutMs ||
    responseBytes > GENERATION_LIMITS.responseBytes
  )
    throw new ProviderError("REQUEST_CONTRACT");
  return {
    id: "openrouter",
    model,
    outputFormat: "website-plan-v1",
    attemptPolicy: "single",
    async generate(input, signal, context) {
      signal.throwIfAborted();
      const body = buildOpenRouterRequestBody(input, model, options.outputMode);
      const started = performance.now();
      const elapsed = () =>
        Math.max(0, Math.floor(performance.now() - started));
      let timings: ProviderTimings | undefined;
      const reportTiming = (stage: keyof ProviderTimings) => {
        if (controller.signal.aborted) return;
        timings = { ...timings, [stage]: elapsed() } as ProviderTimings;
        try {
          context?.onProviderTimings?.({ ...timings });
        } catch {
          /* metadata only */
        }
      };
      const deadline = Date.now() + timeoutMs;
      const controller = new AbortController();
      let response: Response | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const discard = () => {
        // Never await cancellation: injected transports/streams may not cooperate.
        try {
          void (reader ? reader.cancel() : response?.body?.cancel())?.catch(
            () => {},
          );
        } catch {
          /* cleanup only */
        }
      };
      let rejectAbort!: (reason: unknown) => void;
      const aborted = new Promise<never>((_, reject) => {
        rejectAbort = reject;
      });
      const stop = (reason: unknown) => {
        controller.abort(reason);
        discard();
        rejectAbort(reason);
      };
      const checkDeadline = () => {
        if (!controller.signal.aborted && Date.now() >= deadline)
          stop(new DOMException("Provider deadline exceeded.", "TimeoutError"));
        controller.signal.throwIfAborted();
      };
      const callerAbort = () => stop(signal.reason);
      signal.addEventListener("abort", callerAbort, { once: true });
      const timer = setTimeout(
        () =>
          stop(new DOMException("Provider deadline exceeded.", "TimeoutError")),
        timeoutMs,
      );
      const work = async () => {
        try {
          checkDeadline();
          context?.onTransportCall?.();
          checkDeadline();
          response = await (options.fetch ?? globalThis.fetch)(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",
              redirect: "error",
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${options.apiKey}`,
                "Content-Type": "application/json",
              },
              body,
            },
          );
          if (controller.signal.aborted) {
            discard();
            controller.signal.throwIfAborted();
          }
          checkDeadline();
          reportTiming("headersMs");
          try {
            context?.onProviderStatus?.(response.status);
          } catch {
            /* metadata-only observer must not affect inference */
          }
          checkDeadline();
          if (!response.ok) {
            discard();
            const retry = response.headers.get("retry-after");
            const seconds =
              retry && /^\d+(?:\.\d+)?$/.test(retry)
                ? Number(retry) * 1000
                : undefined;
            throw new ProviderError(
              "HTTP",
              response.status,
              Number.isFinite(seconds) ? seconds : undefined,
              { stage: "provider_transport", reason: "HTTP_ERROR" },
            );
          }
          const tooLarge = () =>
            new ProviderError("TOO_LARGE", undefined, undefined, {
              stage: "provider_transport",
              reason: "RESPONSE_TOO_LARGE",
            });
          if (Number(response.headers.get("content-length")) > responseBytes) {
            discard();
            throw tooLarge();
          }
          if (!response.body) throw invalid("EMPTY_RESPONSE");
          reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let bytes = 0;
          while (true) {
            checkDeadline();
            const { done, value } = await reader.read();
            checkDeadline();
            if (done) break;
            if (value.byteLength > 0 && timings?.firstByteMs === undefined)
              reportTiming("firstByteMs");
            bytes += value.byteLength;
            if (bytes > responseBytes) {
              discard();
              throw tooLarge();
            }
            chunks.push(value);
          }
          reportTiming("bodyCompleteMs");
          let raw: string;
          try {
            raw = new TextDecoder("utf-8", { fatal: true }).decode(
              Buffer.concat(chunks),
            );
          } catch {
            throw invalid("MALFORMED_ENVELOPE_JSON");
          }
          const result = { text: content(raw, model) };
          checkDeadline();
          reportTiming("responseCompleteMs");
          checkDeadline();
          return result;
        } catch (error) {
          if (controller.signal.aborted) throw controller.signal.reason;
          if (error instanceof ProviderError) throw error;
          discard();
          throw new ProviderError("NETWORK", undefined, undefined, {
            stage: "provider_transport",
            reason: "NETWORK_ERROR",
          });
        } finally {
          try {
            reader?.releaseLock();
          } catch {
            /* pending noncooperative read */
          }
        }
      };
      try {
        return await Promise.race([work(), aborted]);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", callerAbort);
      }
    },
  };
}
