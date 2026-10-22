import { createServer, type IncomingMessage } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { ProviderError } from "./provider-error";
import { liveEditSourceSchema } from "../src/ai/edit-source";
import type { BackendEditProvider } from "./edit-provider";
import { assertEditTargets } from "./edit-validation";
import {
  EDIT_LIMITS,
  editRequestSchema,
  editResultSchema,
  editStatusSchema,
} from "../src/ai/edit-contract";
import { ModelRouterTimeout } from "./model-router";
import { modelRoutingSchema, type ModelRouting } from "../src/ai/model-routing";
import type { ProviderHttpDiagnostics } from "../src/ai/provider-http";
import {
  GenerationValidationError,
  generationProblemSchema,
  type GenerationProblem,
} from "../src/ai/generation-validation";
import { buildCandidate } from "../src/ai/generation-content";
import { compileWebsitePlan } from "../src/ai/website-plan";
import {
  GENERATION_LIMITS,
  OPENROUTER_GENERATION_LIMITS,
  websiteGenerationRequestSchema,
  type WebsiteGenerationProvider,
} from "../src/ai/website-generation";
import {
  providerTimingsSchema,
  type ProviderTimings,
  type GenerationDiagnostics,
  type GenerationOutcome,
} from "../src/ai/generation-observation";
export type GenerationEvent =
  | { event: "generation_start"; requestId: string; startedAt: string }
  | ({
      event: "generation_finish";
      delivery: "finished" | "disconnected";
    } & GenerationDiagnostics);
export interface GenerationServerOptions {
  onGenerationEvent?: (event: GenerationEvent) => void;
  provider?: WebsiteGenerationProvider;
  editProvider?: BackendEditProvider;
  editLimits?: Partial<
    Record<"requestBytes" | "responseBytes" | "timeoutMs", number>
  >;
  allowedOrigins?: readonly string[];
  requestBytes?: number;
  responseBytes?: number;
  timeoutMs?: number;
  totalTimeoutMs?: number;
  maxAttempts?: number;
  rateLimit?: number;
  rateWindowMs?: number;
  retryDelayMs?: number;
}
class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
async function readRequest<T>(
  req: IncomingMessage,
  limit: number,
  signal: AbortSignal,
  schema: { parse(value: unknown): T },
  invalidMessage: string,
  strictUtf8 = false,
) {
  const tooLarge = () =>
    new HttpError(413, "REQUEST_TOO_LARGE", "Request is too large.");
  if (Number(req.headers["content-length"]) > limit) throw tooLarge();
  const raw = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      req.removeListener("data", data);
      req.removeListener("end", end);
      req.removeListener("error", error);
      signal.removeEventListener("abort", abort);
    };
    const error = (reason: unknown) => {
      cleanup();
      req.pause();
      reject(reason);
    };
    const abort = () => error(signal.reason);
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        error(tooLarge());
        return;
      }
      chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      const body = Buffer.concat(chunks);
      try {
        resolve(
          strictUtf8
            ? new TextDecoder("utf-8", { fatal: true }).decode(body)
            : body.toString("utf8"),
        );
      } catch {
        reject(new HttpError(400, "INVALID_REQUEST", invalidMessage));
      }
    };
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    req.on("data", data);
    req.once("end", end);
    req.once("error", error);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    throw new HttpError(400, "INVALID_REQUEST", invalidMessage);
  }
}
/** Race every operation, including non-cooperative injected providers. Late settlement is ignored. */
function abortable<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return operation();
      })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
export function createGenerationServer(options: GenerationServerOptions = {}) {
  const sessionToken = randomBytes(32).toString("hex");
  const provider = options.provider;
  const generationLimits =
    provider?.id === "openrouter" ||
    provider?.telemetryProvider === "openrouter"
      ? OPENROUTER_GENERATION_LIMITS
      : GENERATION_LIMITS;
  const editProvider = options.editProvider;
  if (
    editProvider &&
    (editProvider.id === "synthetic"
      ? editProvider.source !== undefined
      : editProvider.id !== "openrouter-edit" ||
        !liveEditSourceSchema.safeParse(editProvider.source).success)
  )
    throw new Error("Unsupported edit provider.");
  const editCeilings = {
    requestBytes: EDIT_LIMITS.requestBytes,
    responseBytes: EDIT_LIMITS.responseBytes,
    timeoutMs: EDIT_LIMITS.timeoutMs,
  };
  const editLimits = { ...editCeilings, ...options.editLimits };
  for (const key of Object.keys(
    editCeilings,
  ) as (keyof typeof editCeilings)[]) {
    if (
      !Number.isSafeInteger(editLimits[key]) ||
      editLimits[key] < 1 ||
      editLimits[key] > editCeilings[key]
    )
      throw new Error("Invalid edit limits.");
  }
  const mode = provider
    ? provider.id === "mock"
      ? "mock"
      : "live"
    : "disabled";
  const origins = options.allowedOrigins ?? [
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5178",
    "http://127.0.0.1:5189",
  ];
  let busy = false;
  let pendingProviders = 0;
  let admissions: number[] = [];
  return createServer(async (req, res) => {
    const editing = req.url === "/api/edit/propose";
    let admitted = false;
    const observed = req.method === "POST" && req.url === "/api/generate";
    const requestId = randomUUID();
    const startedAt = new Date().toISOString();
    const startTime = performance.now();
    let providerAttempts = 0;
    let transportCalls = 0;
    let upstreamStatus: number | undefined;
    let providerTimings: ProviderTimings | undefined;
    let routing: ModelRouting | undefined;
    let providerHttp: ProviderHttpDiagnostics | undefined;
    let schemaValidation: GenerationDiagnostics["schemaValidation"] =
      "not_attempted";
    let bodyDiagnostics: GenerationDiagnostics | undefined;
    let terminal = false;
    let problem: GenerationProblem | undefined;
    const retainProblem = (error: unknown) => {
      if (
        error instanceof GenerationValidationError ||
        error instanceof ProviderError
      ) {
        const safe = generationProblemSchema.safeParse(error.diagnostic);
        if (safe.success) problem = safe.data;
      }
    };
    const emit = (event: GenerationEvent) => {
      try {
        if (options.onGenerationEvent) options.onGenerationEvent(event);
        else console.info(JSON.stringify(event));
      } catch {
        /* Observers cannot affect request handling. */
      }
    };
    const diagnostics = (
      outcome: GenerationOutcome,
      httpStatus: number,
    ): GenerationDiagnostics => ({
      requestId,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Math.max(0, Math.floor(performance.now() - startTime)),
      outcome,
      schemaValidation,
      providerAttempts,
      transportCalls,
      httpStatus,
      ...(providerHttp ?? {}),
      ...(!providerHttp && upstreamStatus !== undefined
        ? { providerStatus: upstreamStatus }
        : {}),
      ...(provider?.id === "openrouter" ||
      provider?.telemetryProvider === "openrouter"
        ? { provider: "openrouter" as const, model: provider.model }
        : {}),
      ...(problem ? { problem } : {}),
      ...(routing ? { routing } : {}),
      ...(providerTimings ? { providerTimings } : {}),
    });
    const complete = (delivery: "finished" | "disconnected") => {
      if (!observed || terminal) return;
      terminal = true;
      const outcome =
        delivery === "disconnected"
          ? "cancelled"
          : (bodyDiagnostics?.outcome ?? "cancelled");
      const httpStatus = bodyDiagnostics?.httpStatus ?? 499;
      // Body diagnostics precede transmission. Only this event measures actual finish/close;
      // 'finished' means Node finished writing, not proof that the client consumed the body.
      emit({
        event: "generation_finish",
        ...diagnostics(outcome, httpStatus),
        delivery,
      });
    };
    if (observed) {
      res.setHeader("X-SiteForge-Request-Id", requestId);
      emit({ event: "generation_start", requestId, startedAt });
      res.once("finish", () => complete("finished"));
      res.once("close", () =>
        complete(res.writableFinished ? "finished" : "disconnected"),
      );
    }
    const controller = new AbortController();
    const cancel = () => {
      if (!res.writableEnded)
        controller.abort(
          new HttpError(499, "CANCELLED", "Generation cancelled."),
        );
    };
    req.once("aborted", cancel);
    res.once("close", cancel);
    let totalTimer: ReturnType<typeof setTimeout> | undefined;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status: number, value: unknown) => {
      if (!res.destroyed) {
        res.statusCode = status;
        if (status >= 400) res.setHeader("Connection", "close");
        res.end(JSON.stringify(value));
      }
    };
    try {
      const origin = req.headers.origin;
      if (
        req.headers.host !== `127.0.0.1:${req.socket.localPort}` ||
        ((editing || req.url === "/api/edit/status") &&
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            req.socket.remoteAddress ?? "",
          )) ||
        (origin !== undefined && !origins.includes(origin)) ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        throw new HttpError(403, "FORBIDDEN", "Request is not allowed.");
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      if (req.url === "/api/edit/status") {
        if (req.method !== "GET")
          throw new HttpError(
            405,
            "METHOD_NOT_ALLOWED",
            "Method is not allowed.",
          );
        send(
          200,
          editStatusSchema.parse(
            editProvider
              ? editProvider.id === "synthetic"
                ? { mode: "mock", provider: "synthetic", sessionToken }
                : { mode: "live", ...editProvider.source, sessionToken }
              : { mode: "disabled", provider: null, sessionToken },
          ),
        );
        return;
      }
      if (req.method === "GET" && req.url === "/api/generation/status") {
        send(200, { mode, model: provider?.model ?? "", sessionToken });
        return;
      }
      if (req.url !== "/api/generate" && !editing)
        throw new HttpError(404, "NOT_FOUND", "Endpoint not found.");
      if (req.method === "OPTIONS") {
        if (!origin)
          throw new HttpError(403, "FORBIDDEN", "Request is not allowed.");
        res.setHeader("Access-Control-Allow-Methods", "POST");
        res.setHeader(
          "Access-Control-Allow-Headers",
          editing && editProvider?.id === "openrouter-edit"
            ? "Content-Type, X-SiteForge-Session, X-SiteForge-Edit-Mode"
            : "Content-Type, X-SiteForge-Session",
        );
        res.statusCode = 204;
        res.end();
        return;
      }
      if (req.method !== "POST")
        throw new HttpError(
          405,
          "METHOD_NOT_ALLOWED",
          "Method is not allowed.",
        );
      if (!origin || req.headers["x-siteforge-session"] !== sessionToken)
        throw new HttpError(403, "FORBIDDEN", "Request is not allowed.");
      if (
        !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
          req.headers["content-type"] ?? "",
        )
      )
        throw new HttpError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Content-Type must be application/json.",
        );
      if (editing && !editProvider)
        throw new HttpError(503, "DISABLED", "Editing is disabled.");
      if (!editing && !provider)
        throw new HttpError(503, "DISABLED", "Generation is disabled.");
      const now = Date.now();
      admissions = admissions.filter(
        (t) => now - t < (options.rateWindowMs ?? 60000),
      );
      if (
        busy ||
        pendingProviders ||
        admissions.length >= (options.rateLimit ?? 5)
      )
        throw new HttpError(
          429,
          "BUSY",
          "Generation is busy. Try again later.",
        );
      busy = true;
      admitted = true;
      admissions.push(now);
      const timeout = () =>
        new HttpError(
          504,
          "TIMEOUT",
          editing ? "Editing timed out." : "Generation timed out.",
        );
      const deadline =
        now +
        (editing
          ? editLimits.timeoutMs
          : (options.totalTimeoutMs ?? generationLimits.totalTimeoutMs));
      totalTimer = setTimeout(
        () => controller.abort(timeout()),
        Math.max(1, deadline - Date.now()),
      );
      if (editing) {
        const assertActive = () => {
          if (!controller.signal.aborted && Date.now() >= deadline)
            controller.abort(timeout());
          controller.signal.throwIfAborted();
        };
        const request = await abortable(
          () =>
            readRequest(
              req,
              editLimits.requestBytes,
              controller.signal,
              editRequestSchema,
              "Invalid edit request.",
              true,
            ),
          controller.signal,
        );
        assertActive();
        if (
          editProvider!.id === "openrouter-edit" &&
          req.headers["x-siteforge-edit-mode"] !== "live"
        )
          throw new HttpError(
            403,
            "CONSENT_REQUIRED",
            "Explicit live editing consent is required.",
          );
        const raw = await abortable(() => {
          pendingProviders++;
          return Promise.resolve()
            .then(() => {
              assertActive();
              return editProvider!.propose(
                structuredClone(request),
                controller.signal,
              );
            })
            .finally(() => pendingProviders--);
        }, controller.signal).catch((error) => {
          assertActive();
          if (error instanceof ProviderError && error.code === "REFUSAL")
            throw new HttpError(
              422,
              "EDIT_REFUSED",
              "The edit request could not be fulfilled.",
            );
          throw error;
        });
        assertActive();
        let result;
        try {
          if (
            typeof raw !== "string" ||
            Buffer.byteLength(raw, "utf8") > editLimits.responseBytes
          )
            throw Error();
          result = editResultSchema.parse({
            ...(editProvider!.id === "synthetic"
              ? { mode: "mock" }
              : { mode: "live", source: editProvider!.source }),
            response: JSON.parse(raw),
          });
          assertEditTargets(request.context, result.response);
          if (
            Buffer.byteLength(JSON.stringify(result), "utf8") >
            editLimits.responseBytes
          )
            throw Error();
        } catch {
          assertActive();
          throw new HttpError(
            502,
            "INVALID_OUTPUT",
            "Provider returned invalid edit operations.",
          );
        }
        assertActive();
        send(200, result);
        return;
      }
      if (!provider)
        throw new HttpError(503, "DISABLED", "Generation is disabled.");
      const request = await abortable(
        () =>
          readRequest(
            req,
            options.requestBytes ?? GENERATION_LIMITS.requestBytes,
            controller.signal,
            websiteGenerationRequestSchema,
            "Invalid generation request.",
          ),
        controller.signal,
      );
      let output: { text: string; model?: string } | undefined;
      const attempts = provider.attemptPolicy
        ? 1
        : Math.min(
            2,
            Math.max(1, options.maxAttempts ?? GENERATION_LIMITS.maxAttempts),
          );
      for (let attempt = 0; attempt < attempts; attempt++) {
        const child = new AbortController();
        const relay = () => child.abort(controller.signal.reason);
        controller.signal.addEventListener("abort", relay, { once: true });
        const attemptDeadline = Math.min(
          deadline,
          provider.attemptPolicy === "router"
            ? deadline
            : Date.now() + (options.timeoutMs ?? generationLimits.timeoutMs),
        );
        const timer = setTimeout(
          () => child.abort(timeout()),
          Math.max(1, attemptDeadline - Date.now()),
        );
        try {
          controller.signal.throwIfAborted();
          output = await abortable(() => {
            pendingProviders++;
            return Promise.resolve()
              .then(() => {
                // Describe this attempt, never an earlier transient HTTP failure.
                providerHttp = undefined;
                upstreamStatus = undefined;
                providerTimings = undefined;
                if (provider.attemptPolicy !== "router") providerAttempts++;
                return provider.generate(request, child.signal, {
                  onProviderTimings: (update) => {
                    if (terminal || bodyDiagnostics || child.signal.aborted)
                      return;
                    const parsed = providerTimingsSchema.safeParse(update);
                    if (parsed.success) providerTimings = parsed.data;
                  },
                  onProviderStatus: (status) => {
                    if (
                      !terminal &&
                      !bodyDiagnostics &&
                      !child.signal.aborted &&
                      Number.isInteger(status) &&
                      status >= 100 &&
                      status <= 599
                    )
                      upstreamStatus = status;
                  },
                  onRoutingUpdate: (update) => {
                    if (terminal || bodyDiagnostics || child.signal.aborted)
                      return;
                    const parsed = modelRoutingSchema.safeParse(update);
                    if (parsed.success) {
                      routing = parsed.data;
                      providerAttempts = routing.attempts.length;
                    }
                  },
                  onTransportCall: () => {
                    if (!terminal && !bodyDiagnostics && !child.signal.aborted)
                      transportCalls = Math.min(2, transportCalls + 1);
                  },
                });
              })
              .finally(() => pendingProviders--);
          }, child.signal);
          if (Date.now() >= attemptDeadline) {
            child.abort(timeout());
            throw child.signal.reason;
          }
          child.signal.throwIfAborted();
          controller.signal.throwIfAborted();
          break;
        } catch (error) {
          if (error instanceof ProviderError)
            providerHttp = error.httpDiagnostics;
          if (
            !(error instanceof ProviderError) ||
            !error.retryable ||
            attempt + 1 >= attempts
          )
            throw error;
          const delay = error.retryAfterMs ?? options.retryDelayMs ?? 100;
          if (Date.now() + delay >= deadline) throw timeout();
          await new Promise<void>((resolve, reject) => {
            const signal = controller.signal;
            const cleanup = () => {
              clearTimeout(timer);
              signal.removeEventListener("abort", abort);
            };
            const abort = () => {
              cleanup();
              reject(signal.reason);
            };
            const timer = setTimeout(() => {
              cleanup();
              resolve();
            }, delay);
            signal.addEventListener("abort", abort, { once: true });
            if (signal.aborted) abort();
          });
        } finally {
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", relay);
        }
      }
      controller.signal.throwIfAborted();
      let candidate;
      try {
        if (
          typeof output?.text !== "string" ||
          Buffer.byteLength(output.text, "utf8") >
            (options.responseBytes ?? GENERATION_LIMITS.responseBytes)
        )
          throw Error();
        candidate = (
          provider.outputFormat === "website-plan-v1"
            ? compileWebsitePlan
            : buildCandidate
        )(
          output.text,
          request,
          { id: provider.id, model: output.model ?? provider.model },
          randomUUID(),
        );
      } catch (error) {
        retainProblem(error);
        schemaValidation = "invalid";
        throw new HttpError(
          502,
          "INVALID_OUTPUT",
          "Provider returned invalid content.",
        );
      }
      if (Date.now() >= deadline) throw timeout();
      controller.signal.throwIfAborted();
      schemaValidation = "valid";
      bodyDiagnostics = diagnostics("success", 200);
      send(200, { candidate, mode, diagnostics: bodyDiagnostics });
    } catch (error) {
      retainProblem(error);
      const safe =
        error instanceof HttpError
          ? error
          : error instanceof ModelRouterTimeout ||
              (error instanceof DOMException && error.name === "TimeoutError")
            ? new HttpError(
                504,
                "TIMEOUT",
                editing ? "Editing timed out." : "Generation timed out.",
              )
            : new HttpError(
                502,
                "PROVIDER_ERROR",
                editing ? "Editing failed." : "Generation failed.",
              );
      const invalidProvider =
        error instanceof ProviderError &&
        ["INVALID_OUTPUT", "TOO_LARGE", "REFUSAL"].includes(error.code);
      if (invalidProvider) schemaValidation = "invalid";
      // Guard/request rejections are validation errors; disabled/busy are service errors.
      const outcome: GenerationOutcome =
        safe.code === "TIMEOUT"
          ? "timeout"
          : safe.code === "CANCELLED"
            ? "cancelled"
            : invalidProvider ||
                safe.code === "INVALID_OUTPUT" ||
                (safe.status >= 400 &&
                  safe.status < 500 &&
                  safe.code !== "BUSY")
              ? "validation_error"
              : "provider_error";
      if (observed && !terminal)
        bodyDiagnostics = diagnostics(outcome, safe.status);
      send(safe.status, {
        error: { code: safe.code, message: safe.message },
        ...(observed ? { diagnostics: bodyDiagnostics } : {}),
      });
    } finally {
      if (totalTimer) clearTimeout(totalTimer);
      req.removeListener("aborted", cancel);
      res.removeListener("close", cancel);
      if (admitted) busy = false;
    }
  });
}
