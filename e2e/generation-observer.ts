import type { Page, Request, Response } from "@playwright/test";
import { z } from "zod";
import {
  generationProblemSchema,
  type GenerationProblem,
} from "../src/ai/generation-validation";
import { generationOutcomeSchema } from "../src/ai/generation-observation";
import {
  providerHttpDiagnosticsSchema,
  type ProviderHttpDiagnostics,
} from "../src/ai/provider-http";
export type GenerationObservation = {
  phase:
    | "prepared"
    | "submitted"
    | "response_headers"
    | "terminal"
    | "observer_timeout"
    | "observer_error";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  requestId: string | null;
  httpStatus: number | null;
  generationPosts: number;
  uiState: string | null;
  schemaValidation: string | null;
  transportCalls: number | null;
  blockCount: number | null;
  candidatePreview: boolean;
  serverDurationMs: number | null;
  providerStatus: number | null;
  providerErrorCategory:
    ProviderHttpDiagnostics["providerErrorCategory"] | null;
  providerRetryable: boolean | null;
  providerRpcStatus: ProviderHttpDiagnostics["providerRpcStatus"] | null;
  problem: GenerationProblem | null;
};
export type ObservationOptions = {
  timeoutMs?: number;
  onProgress?: (record: GenerationObservation) => void;
  afterSubmit?: () => Promise<void>;
};
/** Observe one UI submission. Never await response.finished()/json(), or retry a click. */
export async function observeGeneration(
  page: Page,
  options: ObservationOptions = {},
): Promise<GenerationObservation> {
  const start = performance.now();
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, options.timeoutMs!)
    : 105000;
  const record: GenerationObservation = {
    phase: "prepared",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    requestId: null,
    httpStatus: null,
    generationPosts: 0,
    uiState: null,
    schemaValidation: null,
    transportCalls: null,
    blockCount: null,
    candidatePreview: false,
    serverDurationMs: null,
    providerStatus: null,
    providerErrorCategory: null,
    providerRetryable: null,
    providerRpcStatus: null,
    problem: null,
  };
  let evidenceWriteFailed = false;
  const publish = () => {
    try {
      options.onProgress?.({ ...record });
    } catch {
      evidenceWriteFailed = true;
    }
  };
  let expired = false;
  let expire!: () => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    expire = () => {
      expired = true;
      reject(new Error("observer deadline"));
    };
  });
  const timer = setTimeout(expire, timeoutMs);
  const bounded = <T>(operation: () => Promise<T>) =>
    Promise.race([operation(), deadline]);
  const isGeneration = (request: Request) =>
    request.method() === "POST" &&
    new URL(request.url()).pathname === "/api/generate";
  const onRequest = (request: Request) => {
    if (!isGeneration(request)) return;
    record.generationPosts++;
    record.phase = "submitted";
    publish();
  };
  const onResponse = (response: Response) => {
    if (!isGeneration(response.request())) return;
    record.httpStatus = response.status();
    const id = z.uuid().safeParse(response.headers()["x-siteforge-request-id"]);
    if (id.success) record.requestId = id.data;
    record.phase = "response_headers";
    publish();
  };
  const integer = (value: string | null, max: number) =>
    value !== null &&
    /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) <= max
      ? Number(value)
      : null;
  page.on("request", onRequest);
  page.on("response", onResponse);
  try {
    publish();
    if (evidenceWriteFailed)
      throw new Error("Evidence writer unavailable before submission");
    const panel = page.getByRole("region", {
      name: "Website generator",
      exact: true,
    });
    await bounded(() =>
      panel
        .getByRole("button", { name: "Generate candidate", exact: true })
        .click({ timeout: timeoutMs }),
    );
    if (options.afterSubmit) await bounded(options.afterSubmit);
    while (true) {
      const data = await bounded(() =>
        panel.evaluate((root) => {
          const meta = root.querySelector('[aria-label="Generation status"]');
          const preview = root.querySelector(
            '[aria-label="Candidate preview"]',
          );
          return {
            state: root.getAttribute("data-generation-state"),
            requestId: meta?.getAttribute("data-request-id") ?? null,
            schemaValidation:
              meta?.getAttribute("data-schema-validation") ?? null,
            transportCalls: meta?.getAttribute("data-transport-calls") ?? null,
            durationMs: meta?.getAttribute("data-duration-ms") ?? null,
            origin: meta?.getAttribute("data-diagnostics-origin") ?? null,
            providerRpcStatus:
              meta?.getAttribute("data-provider-rpc-status") ?? null,
            providerStatus: meta?.getAttribute("data-provider-status") ?? null,
            providerErrorCategory:
              meta?.getAttribute("data-provider-error-category") ?? null,
            providerRetryable:
              meta?.getAttribute("data-provider-retryable") ?? null,
            problem: meta?.getAttribute("data-generation-problem") ?? null,
            blockCount: root.getAttribute("data-generation-block-count"),
            preview: !!preview?.getClientRects().length,
          };
        }),
      );
      record.problem = null;
      if (data.problem) {
        try {
          const safe = generationProblemSchema.safeParse(
            JSON.parse(data.problem),
          );
          if (safe.success) record.problem = safe.data;
        } catch {
          /* Never persist unvalidated DOM content. */
        }
      }
      const outcome = generationOutcomeSchema.safeParse(data.state);
      if (
        outcome.success ||
        data.state === "generating" ||
        data.state === "idle"
      )
        record.uiState = data.state;
      const id = z.uuid().safeParse(data.requestId);
      if (id.success) record.requestId = id.data;
      if (
        ["not_attempted", "valid", "invalid"].includes(
          data.schemaValidation ?? "",
        )
      )
        record.schemaValidation = data.schemaValidation;
      record.transportCalls = integer(data.transportCalls, 2);
      const providerHttp =
        data.origin === "server"
          ? providerHttpDiagnosticsSchema.safeParse({
              providerStatus: integer(data.providerStatus, 599),
              providerErrorCategory: data.providerErrorCategory,
              providerRpcStatus: data.providerRpcStatus ?? undefined,
              providerRetryable:
                data.providerRetryable === "true"
                  ? true
                  : data.providerRetryable === "false"
                    ? false
                    : null,
            })
          : null;
      record.providerStatus = providerHttp?.success
        ? providerHttp.data.providerStatus
        : null;
      record.providerErrorCategory = providerHttp?.success
        ? providerHttp.data.providerErrorCategory
        : null;
      record.providerRetryable = providerHttp?.success
        ? providerHttp.data.providerRetryable
        : null;
      record.providerRpcStatus = providerHttp?.success
        ? (providerHttp.data.providerRpcStatus ?? null)
        : null;
      record.serverDurationMs =
        data.origin === "server"
          ? integer(data.durationMs, Number.MAX_SAFE_INTEGER)
          : null;
      record.blockCount = integer(data.blockCount, 12);
      record.candidatePreview = data.preview;
      if (
        record.generationPosts === 1 &&
        outcome.success &&
        (outcome.data !== "success" || data.preview)
      ) {
        record.phase = "terminal";
        break;
      }
      await bounded(
        () => new Promise<void>((resolve) => setTimeout(resolve, 10)),
      );
    }
  } catch {
    record.phase = expired ? "observer_timeout" : "observer_error";
  } finally {
    clearTimeout(timer);
    page.off("request", onRequest);
    page.off("response", onResponse);
    record.finishedAt = new Date().toISOString();
    record.durationMs = Math.max(0, Math.round(performance.now() - start));
    publish();
  }
  return { ...record };
}
