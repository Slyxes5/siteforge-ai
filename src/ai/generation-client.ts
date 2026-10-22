import { projectSchema } from "../project-schema/project";
import {
  generationDiagnosticsSchema,
  type GenerationDiagnostics,
} from "./generation-observation";
import {
  websiteGenerationRequestSchema,
  GENERATION_LIMITS,
  type WebsiteGenerationRequest,
  type GenerationResult,
} from "./website-generation";
import { z } from "zod";
import { validateGenerationCandidate } from "./generation-content";
import {
  abortableGeneration,
  abortFailure,
  GenerationFailure,
} from "./generation-runtime";
const statusSchema = z.strictObject({
  mode: z.enum(["disabled", "mock", "live"]),
  model: z.string().max(100),
  sessionToken: z.string().min(16).max(256),
});
const resultSchema = z
  .strictObject({
    candidate: projectSchema,
    mode: z.enum(["mock", "live"]),
    diagnostics: generationDiagnosticsSchema.optional(),
  })
  .refine(
    (value) =>
      value.candidate.revision === 0 &&
      value.candidate.generation?.kind === "ai" &&
      value.candidate.generation.mode === value.mode,
    "Invalid generation provenance",
  );
async function readBounded(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  if (signal.aborted) throw abortFailure(signal);
  if (!response.body)
    throw new GenerationFailure("validation_error", "Empty backend response");
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await abortableGeneration(
        () => reader.read(),
        signal,
      );
      if (done) break;
      bytes += value.byteLength;
      if (bytes > GENERATION_LIMITS.responseBytes) {
        cancel();
        throw new GenerationFailure(
          "validation_error",
          "Backend response too large",
        );
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    try {
      reader.releaseLock();
    } catch {
      /* A non-cooperative stream must not mask cancellation. */
    }
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(combined));
  } catch {
    throw new GenerationFailure(
      "validation_error",
      "Backend returned invalid JSON. Nothing was saved.",
    );
  }
}
/** Same-origin client. No provider credentials, endpoints or saved projects cross this boundary. */
async function requestGeneration(
  input: WebsiteGenerationRequest,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
  options: GenerationClientOptions = {},
): Promise<GenerationResult> {
  const parsedRequest = websiteGenerationRequestSchema.safeParse(input);
  if (!parsedRequest.success)
    throw new GenerationFailure(
      "validation_error",
      "Invalid generation request. Nothing was sent.",
    );
  const request = parsedRequest.data;
  const statusResponse = await transport("/api/generation/status", {
    signal,
    cache: "no-store",
  });
  if (!statusResponse.ok)
    throw new GenerationFailure(
      "provider_error",
      "Generation backend unavailable. Use the local template fallback.",
    );
  const parsedStatus = statusSchema.safeParse(
    await readBounded(statusResponse, signal),
  );
  if (!parsedStatus.success)
    throw new GenerationFailure(
      "provider_error",
      "Invalid generation backend status.",
    );
  const status = parsedStatus.data;
  if (status.mode === "disabled")
    throw new GenerationFailure(
      "provider_error",
      "Live generation is disabled. No AI request was sent. Use the local template fallback.",
    );
  signal.throwIfAborted();
  const response = await transport("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-SiteForge-Session": status.sessionToken,
    },
    body: JSON.stringify(request),
    signal,
  });
  const headerId = z
    .uuid()
    .safeParse(response.headers.get("X-SiteForge-Request-Id"));
  if (headerId.success) {
    try {
      options.onRequestId?.(headerId.data);
    } catch {
      /* Diagnostics must not affect generation. */
    }
  }
  if (!response.ok) {
    let diagnostics: GenerationDiagnostics | undefined;
    try {
      const body = await readBounded(response, signal);
      if (typeof body === "object" && body !== null && "diagnostics" in body) {
        const parsed = generationDiagnosticsSchema.safeParse(body.diagnostics);
        if (
          parsed.success &&
          parsed.data.outcome !== "success" &&
          parsed.data.httpStatus === response.status &&
          (!headerId.success || parsed.data.requestId === headerId.data)
        )
          diagnostics = parsed.data;
      }
    } catch (error) {
      if (
        error instanceof GenerationFailure &&
        (error.outcome === "timeout" || error.outcome === "cancelled")
      )
        throw error;
    }

    const messages: Record<number, string> = {
      429: "Generation rate limit reached or another request is busy. Try later or use a template.",
      504: "Generation timed out. No candidate was saved.",
      503: "Generation provider unavailable. Use the local template fallback.",
      403: "Generation request was blocked by local security checks.",
    };
    // Never reflect a raw provider/backend body into UI errors.
    throw new GenerationFailure(
      diagnostics?.outcome === "success"
        ? "provider_error"
        : (diagnostics?.outcome ??
            (response.status === 504 ? "timeout" : "provider_error")),
      messages[response.status] ||
        "Generation failed validation or the provider returned an error. Nothing was saved.",
      diagnostics,
    );
  }
  const parsedResult = resultSchema.safeParse(
    await readBounded(response, signal),
  );
  if (!parsedResult.success)
    throw new GenerationFailure(
      "validation_error",
      "Generation response failed schema validation. Nothing was saved.",
    );
  const result = parsedResult.data;
  if (
    result.diagnostics &&
    (result.diagnostics.outcome !== "success" ||
      result.diagnostics.schemaValidation !== "valid" ||
      result.diagnostics.httpStatus !== response.status ||
      (headerId.success && result.diagnostics.requestId !== headerId.data))
  )
    throw new GenerationFailure(
      "validation_error",
      "Invalid generation diagnostics. Nothing was saved.",
    );
  try {
    validateGenerationCandidate(result.candidate, input);
  } catch {
    throw new GenerationFailure(
      "validation_error",
      "Invalid generation candidate. Nothing was saved.",
    );
  }
  signal.throwIfAborted();
  if (result.mode !== status.mode)
    throw new GenerationFailure(
      "validation_error",
      "Generation mode changed. Candidate rejected.",
    );
  return result;
}
export type GenerationClientOptions = {
  timeoutMs?: number;
  onRequestId?: (id: string) => void;
};
export async function generateWebsite(
  input: WebsiteGenerationRequest,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
  options: GenerationClientOptions = {},
): Promise<GenerationResult> {
  const controller = new AbortController();
  const relay = () => controller.abort(signal.reason);
  if (signal.aborted) relay();
  else signal.addEventListener("abort", relay, { once: true });
  const requested = options.timeoutMs ?? GENERATION_LIMITS.clientTimeoutMs;
  const timeoutMs = Number.isFinite(requested)
    ? Math.min(GENERATION_LIMITS.clientTimeoutMs, Math.max(1, requested))
    : GENERATION_LIMITS.clientTimeoutMs;
  const timer = setTimeout(
    () =>
      controller.abort(new DOMException("Generation deadline", "TimeoutError")),
    timeoutMs,
  );
  try {
    return await abortableGeneration(
      () => requestGeneration(input, controller.signal, transport, options),
      controller.signal,
    );
  } catch (error) {
    if (error instanceof GenerationFailure) throw error;
    throw new GenerationFailure(
      "provider_error",
      "Generation backend unavailable. Nothing was saved.",
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", relay);
  }
}
