import { createGenerationServer } from "./generation-server";
import { createGeminiProvider } from "./gemini-provider";
import { planFromMockContent } from "./mock-website-plan";
import { createRoutedGenerationProvider } from "./routed-generation-provider";
import { GEMINI_GENERATION_MODEL_ORDER } from "./gemini-generation-profile";
import {
  createSmokeTransportAudit,
  type SmokeTransportEvent,
} from "./smoke-transport-audit";
export function singleUseTransport(transport: typeof fetch) {
  return limitedUseTransport(transport, 1);
}
function limitedUseTransport(transport: typeof fetch, limit: 1 | 2) {
  let used = 0;
  const guarded: typeof fetch = async (input, init) => {
    if (used >= limit)
      throw new Error(
        "Smoke transport budget exhausted. Restart requires new approval.",
      );
    init?.signal?.throwIfAborted();
    used++; // Reserve synchronously before awaiting, and never refund failures.
    return transport(input, init);
  };
  return { fetch: guarded, outboundRequests: () => used };
}
export function createSmokeServer(
  env: NodeJS.ProcessEnv,
  args: readonly string[],
  transport?: typeof fetch,
  onTransportEvent: (event: SmokeTransportEvent) => void = () => {},
) {
  const routed =
    args.length === 1 && ["--mock-routed", "--live-routed"].includes(args[0]);
  const mode =
    args.length === 0
      ? "disabled"
      : args.length === 1 && ["--mock", "--mock-routed"].includes(args[0])
        ? "mock"
        : args.length === 1 && ["--live", "--live-routed"].includes(args[0])
          ? "live"
          : null;
  if (!mode) throw new Error("Smoke mode is not authorized.");
  const model = routed
    ? GEMINI_GENERATION_MODEL_ORDER[0]
    : (env.SITEFORGE_GEMINI_MODEL ?? "gemini-3.5-flash-lite");
  const models = routed ? [...GEMINI_GENERATION_MODEL_ORDER] : [model];
  const outboundLimit = routed ? 2 : 1;
  if (model.length > 100 || !/^gemini-[a-z0-9][a-z0-9.-]{0,99}$/.test(model))
    throw new Error("Invalid smoke model.");
  const fixture: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify(
                    planFromMockContent({
                      blocks: [
                        {
                          id: "title",
                          type: "heading",
                          text: "SiteForge smoke test — MOCK",
                        },
                        {
                          id: "intro",
                          type: "paragraph",
                          text: "Synthetic test content. Not real Gemini output.",
                        },
                      ],
                    }),
                  ),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  if (
    mode === "live" &&
    (env.SITEFORGE_AI_PROVIDER !== "gemini" ||
      env.SITEFORGE_AI_ALLOW_LIVE !== "true" ||
      env.SITEFORGE_AI_TEST_MODE === "true" ||
      env.SITEFORGE_SMOKE_FREE_TIER_CONFIRMED !== "true" ||
      (routed && env.SITEFORGE_SMOKE_ROUTING_CONFIRMED !== "true") ||
      !env.SITEFORGE_GEMINI_API_KEY?.trim())
  )
    throw new Error("Live smoke prerequisites are not satisfied.");
  let mockCalls = 0;
  const mockTransport: typeof fetch = async (input, init) => {
    // Exercise an actual fallback in the explicit mock profile; native transport is never used.
    if (routed && ++mockCalls === 1)
      return Response.json(
        { error: { code: 503, status: "UNAVAILABLE" } },
        { status: 503 },
      );
    return fixture(input, init);
  };
  const budget = limitedUseTransport(
    mode === "disabled"
      ? async () => {
          throw new Error("Smoke is disabled");
        }
      : createSmokeTransportAudit(
          transport ?? (mode === "mock" ? mockTransport : globalThis.fetch),
          onTransportEvent,
        ),
    outboundLimit,
  );
  const factory = (selectedModel: string) =>
    createGeminiProvider({
      apiKey:
        mode === "mock"
          ? "synthetic-smoke-test-only"
          : env.SITEFORGE_GEMINI_API_KEY!,
      model: selectedModel,
      fetch: budget.fetch,
    });
  const adapter =
    mode === "disabled"
      ? undefined
      : routed
        ? createRoutedGenerationProvider(
            {
              models,
              verifiedModels: models,
              freeTierConfirmed: true,
              maxAttempts: 2,
              attemptTimeoutMs: 30000,
              totalTimeoutMs: 60000,
            },
            factory,
          )
        : factory(model);
  // A second submission must not consume a leftover fallback slot after primary success.
  let submissionUsed = false;
  const boundedAdapter =
    adapter && routed
      ? {
          ...adapter,
          generate(...args: Parameters<typeof adapter.generate>) {
            args[1].throwIfAborted();
            if (submissionUsed)
              throw new Error("Smoke submission budget exhausted.");
            submissionUsed = true;
            return adapter.generate(...args);
          },
        }
      : adapter;
  const provider =
    boundedAdapter && mode === "mock"
      ? { ...boundedAdapter, id: "mock" as const }
      : boundedAdapter;
  return {
    server: createGenerationServer({ provider, maxAttempts: 1, rateLimit: 1 }),
    mode,
    model,
    models,
    routed,
    outboundLimit,
    outboundRequests: budget.outboundRequests,
  };
}
