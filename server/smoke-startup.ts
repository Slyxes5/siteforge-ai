import { createGenerationServer } from "./generation-server";
import { createGeminiProvider } from "./gemini-provider";
import { planFromMockContent } from "./mock-website-plan";
import {
  createSmokeTransportAudit,
  type SmokeTransportEvent,
} from "./smoke-transport-audit";
export function singleUseTransport(transport: typeof fetch) {
  let used = false;
  const guarded: typeof fetch = async (input, init) => {
    if (used)
      throw new Error(
        "Single-request smoke budget exhausted. Restart requires new approval.",
      );
    init?.signal?.throwIfAborted();
    used = true; // Reserve synchronously before awaiting, and never refund failures.
    return transport(input, init);
  };
  return { fetch: guarded, outboundRequests: () => (used ? 1 : 0) };
}
export function createSmokeServer(
  env: NodeJS.ProcessEnv,
  args: readonly string[],
  transport?: typeof fetch,
  onTransportEvent: (event: SmokeTransportEvent) => void = () => {},
) {
  const mode =
    args.length === 0
      ? "disabled"
      : args.length === 1 && args[0] === "--mock"
        ? "mock"
        : args.length === 1 && args[0] === "--live"
          ? "live"
          : null;
  if (!mode) throw new Error("Smoke mode is not authorized.");
  const model = env.SITEFORGE_GEMINI_MODEL ?? "gemini-3.5-flash-lite";
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
      !env.SITEFORGE_GEMINI_API_KEY?.trim())
  )
    throw new Error("Live smoke prerequisites are not satisfied.");
  const budget = singleUseTransport(
    mode === "disabled"
      ? async () => {
          throw new Error("Smoke is disabled");
        }
      : createSmokeTransportAudit(
          transport ?? (mode === "mock" ? fixture : globalThis.fetch),
          onTransportEvent,
        ),
  );
  const adapter =
    mode === "disabled"
      ? undefined
      : createGeminiProvider({
          apiKey:
            mode === "mock"
              ? "synthetic-smoke-test-only"
              : env.SITEFORGE_GEMINI_API_KEY!,
          model,
          fetch: budget.fetch,
        });
  const provider =
    adapter && mode === "mock" ? { ...adapter, id: "mock" as const } : adapter;
  return {
    server: createGenerationServer({ provider, maxAttempts: 1, rateLimit: 1 }),
    mode,
    model,
    outboundRequests: budget.outboundRequests,
  };
}
