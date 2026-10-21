import {
  type EditProviderRequest,
  type StructuredEditProvider,
  structuredEditResponseSchema,
} from "../src/ai/structured-edit";
import { editRequestSchema } from "../src/ai/edit-contract";
import { assertEditTargets } from "./edit-validation";
import {
  buildOpenRouterEditRequestBody,
  OPENROUTER_EDIT_LIMITS,
  OPENROUTER_EDIT_MODEL,
} from "./openrouter-edit-request";
import { ProviderError } from "./provider-error";

interface OpenRouterEditOptions {
  apiKey: string;
  // Deliberately required: Stage 3A has no ambient/global network transport.
  fetch: typeof globalThis.fetch;
  model?: string;
  timeoutMs?: number;
  responseBytes?: number;
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function invalid(): never {
  throw new ProviderError("INVALID_OUTPUT");
}
function decode(raw: string, request: EditProviderRequest): string {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    invalid();
  }
  if (
    !object(data) ||
    "error" in data ||
    ![OPENROUTER_EDIT_MODEL, OPENROUTER_EDIT_MODEL.slice(0, -5)].includes(
      data.model as string,
    ) ||
    !Array.isArray(data.choices) ||
    data.choices.length !== 1 ||
    !object(data.choices[0])
  )
    invalid();
  if (
    "usage" in data &&
    (!object(data.usage) || ("cost" in data.usage && data.usage.cost !== 0))
  )
    invalid();
  const choice = data.choices[0];
  if ("error" in choice) invalid();
  if (choice.finish_reason === "content_filter")
    throw new ProviderError("REFUSAL");
  if (choice.finish_reason !== "stop") invalid();
  const message = choice.message;
  if (!object(message) || message.role !== "assistant") invalid();
  if (message.refusal != null && message.refusal !== "")
    throw new ProviderError("REFUSAL");
  if (
    "tool_calls" in message ||
    "function_call" in message ||
    typeof message.content !== "string"
  )
    invalid();
  let operations: unknown;
  try {
    operations = JSON.parse(message.content);
  } catch {
    invalid();
  }
  if (object(operations) && operations.refusal === true)
    throw new ProviderError("REFUSAL");
  const parsed = structuredEditResponseSchema.safeParse(operations);
  if (!parsed.success) invalid();
  try {
    assertEditTargets(request.context, parsed.data);
  } catch {
    invalid();
  }
  // Still untrusted operations: no host metadata, draft mutation, Apply or Save.
  return JSON.stringify(parsed.data);
}

/** Dormant adapter, not a Stage 1 BackendEditProvider and not wired into startup/UI. */
export function createOpenRouterEditProvider(
  options: OpenRouterEditOptions,
): StructuredEditProvider & {
  readonly model: string;
  readonly attemptPolicy: "single";
} {
  const { apiKey, fetch: transport } = options;
  const model = options.model ?? OPENROUTER_EDIT_MODEL;
  const timeoutMs = options.timeoutMs ?? OPENROUTER_EDIT_LIMITS.timeoutMs;
  const responseBytes =
    options.responseBytes ?? OPENROUTER_EDIT_LIMITS.responseBytes;
  if (
    typeof apiKey !== "string" ||
    !/^[\x21-\x7e]+$/.test(apiKey) ||
    typeof transport !== "function" ||
    model !== OPENROUTER_EDIT_MODEL ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > OPENROUTER_EDIT_LIMITS.timeoutMs ||
    !Number.isSafeInteger(responseBytes) ||
    responseBytes < 1 ||
    responseBytes > OPENROUTER_EDIT_LIMITS.responseBytes
  )
    throw new ProviderError("REQUEST_CONTRACT");
  return {
    id: "openrouter-edit",
    source: { provider: "openrouter", model },
    model,
    attemptPolicy: "single",
    async propose(input, caller) {
      const cancelled = () =>
        new DOMException("Edit request cancelled.", "AbortError");
      if (caller.aborted) throw cancelled();
      const body = buildOpenRouterEditRequestBody(input, model);
      const request = editRequestSchema.parse(input);
      const controller = new AbortController();
      const deadline = performance.now() + timeoutMs;
      let response: Response | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const discard = () => {
        try {
          void (reader ? reader.cancel() : response?.body?.cancel())?.catch(
            () => {},
          );
        } catch {
          // Cleanup must never block rejection or reveal transport details.
        }
      };
      let rejectAbort!: (reason: unknown) => void;
      const aborted = new Promise<never>((_, reject) => {
        rejectAbort = reject;
      });
      const stop = (reason: DOMException) => {
        if (controller.signal.aborted) return;
        controller.abort(reason);
        discard();
        rejectAbort(reason);
      };
      const timeout = () =>
        stop(new DOMException("Edit request timed out.", "TimeoutError"));
      const assertActive = () => {
        if (!controller.signal.aborted && performance.now() >= deadline)
          timeout();
        controller.signal.throwIfAborted();
      };
      const onAbort = () => stop(cancelled());
      caller.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(timeout, timeoutMs);
      const work = async () => {
        try {
          assertActive();
          response = await transport(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",
              redirect: "error",
              credentials: "omit",
              cache: "no-store",
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body,
            },
          );
          assertActive();
          if (!response.ok) throw new ProviderError("HTTP", response.status);
          if (
            !/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/i.test(
              response.headers.get("content-type") ?? "",
            )
          )
            invalid();
          const length = response.headers.get("content-length");
          if (
            length !== null &&
            (!/^\d+$/.test(length) ||
              !Number.isSafeInteger(Number(length)) ||
              Number(length) > responseBytes)
          )
            throw new ProviderError("TOO_LARGE");
          if (!response.body) invalid();
          reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const { done, value } = await reader.read();
            assertActive();
            if (done) break;
            size += value.byteLength;
            if (size > responseBytes) throw new ProviderError("TOO_LARGE");
            chunks.push(value);
          }
          let raw: string;
          try {
            raw = new TextDecoder("utf-8", { fatal: true }).decode(
              Buffer.concat(chunks),
            );
          } catch {
            invalid();
          }
          const result = decode(raw, request);
          assertActive();
          return result;
        } catch (error) {
          discard();
          if (controller.signal.aborted) throw controller.signal.reason;
          if (error instanceof ProviderError) throw error;
          throw new ProviderError("NETWORK");
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
        caller.removeEventListener("abort", onAbort);
      }
    },
  };
}
