import { z } from "zod";
import { buildGeminiRequestBody } from "./gemini-request-contract";
import { buildWebsitePlanRequestBody } from "./website-plan-request";
import { ProviderError } from "./provider-error";
import { readProviderRpcStatus } from "./provider-rpc-status";
import {
  GenerationValidationError,
  type GenerationProblem,
} from "../src/ai/generation-validation";

import {
  GENERATION_LIMITS,
  type WebsiteGenerationProvider,
} from "../src/ai/website-generation";
function invalid(
  reason: GenerationProblem["reason"],
  stage: GenerationProblem["stage"] = "provider_envelope",
  error?: z.ZodError,
): ProviderError {
  return new ProviderError(
    reason === "PROVIDER_REFUSAL" ? "REFUSAL" : "INVALID_OUTPUT",
    undefined,
    undefined,
    new GenerationValidationError(stage, reason, error).diagnostic,
  );
}
export interface GeminiOptions {
  /** Explicit local rollback only; no automatic second request with another contract. */
  contract?: "website-plan-v1" | "m2c";
  apiKey: string;
  model?: string;
  fetch?: typeof globalThis.fetch;
  responseBytes?: number;
}
const envelopeSchema = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z
    .array(
      z.object({
        finishReason: z.string(),
        safetyRatings: z
          .array(z.object({ blocked: z.boolean().optional() }))
          .optional(),
        content: z.object({
          parts: z
            .array(
              z.strictObject({
                text: z.string(),
                thought: z.boolean().optional(),
                // Documented opaque protocol metadata, never candidate content or telemetry.
                thoughtSignature: z.string().optional(),
                partMetadata: z.record(z.string(), z.unknown()).optional(),
              }),
            )
            .min(1),
        }),
      }),
    )
    .length(1),
});
function retryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? Math.max(0, timestamp - Date.now())
    : undefined;
}
async function readBounded(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<string> {
  if (Number(response.headers.get("content-length")) > limit) {
    void response.body?.cancel().catch(() => {});
    throw new ProviderError("TOO_LARGE", undefined, undefined, {
      stage: "provider_transport",
      reason: "RESPONSE_TOO_LARGE",
    });
  }
  if (!response.body) throw invalid("EMPTY_RESPONSE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        cancel();
        throw new ProviderError("TOO_LARGE", undefined, undefined, {
          stage: "provider_transport",
          reason: "RESPONSE_TOO_LARGE",
        });
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
export function createGeminiProvider(
  options: GeminiOptions,
): WebsiteGenerationProvider {
  const model = options.model ?? "gemini-3.5-flash-lite";
  if (model.length > 100 || !/^gemini-[a-z0-9][a-z0-9.-]{0,99}$/.test(model))
    throw new Error("Invalid Gemini model ID.");
  if (!options.apiKey.trim()) throw new Error("Gemini API key is required.");
  return {
    id: "gemini",
    model,
    outputFormat: options.contract ?? "website-plan-v1",
    async generate(request, signal, context) {
      signal.throwIfAborted();
      const body =
        options.contract === "m2c"
          ? buildGeminiRequestBody(request)
          : buildWebsitePlanRequestBody(request);
      let response: Response;
      try {
        context?.onTransportCall?.();
        response = await (options.fetch ?? globalThis.fetch)(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            redirect: "error",
            signal,
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": options.apiKey,
            },
            body,
          },
        );
      } catch {
        signal.throwIfAborted();
        throw new ProviderError("NETWORK", undefined, undefined, {
          stage: "provider_transport",
          reason: "NETWORK_ERROR",
        });
      }
      if (signal.aborted) {
        // A configured transport may ignore abort and resolve late. Dispose its unread body.
        void response.body?.cancel().catch(() => {});
        signal.throwIfAborted();
      }
      if (!response.ok) {
        const rpcStatus = await readProviderRpcStatus(response, signal);
        signal.throwIfAborted();
        throw new ProviderError(
          "HTTP",
          response.status,
          retryAfter(response.headers.get("retry-after")),
          { stage: "provider_transport", reason: "HTTP_ERROR" },
          rpcStatus,
        );
      }
      let raw: string;
      try {
        raw = await readBounded(
          response,
          options.responseBytes ?? GENERATION_LIMITS.responseBytes,
          signal,
        );
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof ProviderError) throw error;
        throw new ProviderError("NETWORK", undefined, undefined, {
          stage: "provider_transport",
          reason: "NETWORK_ERROR",
        });
      }
      signal.throwIfAborted();
      if (!raw.trim()) throw invalid("EMPTY_RESPONSE");
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        throw invalid("MALFORMED_ENVELOPE_JSON");
      }
      if (
        typeof data === "object" &&
        data !== null &&
        "promptFeedback" in data
      ) {
        const feedback = data.promptFeedback;
        if (
          typeof feedback === "object" &&
          feedback !== null &&
          "blockReason" in feedback
        )
          throw invalid("PROVIDER_REFUSAL");
      }
      // Inspect termination before requiring text: refusals/truncation may omit content.
      const termination = z
        .object({
          candidates: z.array(z.object({ finishReason: z.string() })).length(1),
        })
        .safeParse(data);
      if (termination.success) {
        const reason = termination.data.candidates[0].finishReason;
        if (reason === "MAX_TOKENS") throw invalid("OUTPUT_TRUNCATED");
        if (
          [
            "SAFETY",
            "RECITATION",
            "BLOCKLIST",
            "PROHIBITED_CONTENT",
            "SPII",
            "IMAGE_SAFETY",
          ].includes(reason)
        )
          throw invalid("PROVIDER_REFUSAL");
        if (reason !== "STOP") throw invalid("PROVIDER_FINISH_REASON");
      }
      const result = envelopeSchema.safeParse(data);
      if (!result.success)
        throw invalid(
          "INVALID_PROVIDER_ENVELOPE",
          "provider_envelope",
          result.error,
        );
      const candidate = result.data.candidates[0];
      if (
        candidate.finishReason !== "STOP" ||
        candidate.safetyRatings?.some((r) => r.blocked)
      )
        throw invalid("PROVIDER_REFUSAL");
      if (candidate.content.parts.some((p) => p.thought))
        throw invalid("UNSUPPORTED_PROVIDER_PART");
      const text = candidate.content.parts.map((p) => p.text).join("");
      if (!text.trim()) throw invalid("EMPTY_CONTENT", "content_json");
      return { text };
    },
  };
}
