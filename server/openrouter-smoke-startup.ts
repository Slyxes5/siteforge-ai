import { createGenerationServer } from "./generation-server";
import { createOpenRouterProvider } from "./openrouter-provider";
import { readOpenRouterSettings } from "./openrouter-settings";
import { singleUseTransport } from "./smoke-startup";
import {
  createSmokeTransportAudit,
  type SmokeTransportEvent,
} from "./smoke-transport-audit";
import { coffeeMockContent } from "../scripts/coffee-acceptance-scenario";
import { planFromMockContent } from "./mock-website-plan";
/** Separate launcher: never enters Gemini's model router or performs provider/model fallback. */
export function createOpenRouterSmokeServer(
  env: NodeJS.ProcessEnv,
  args: readonly string[],
  transport?: typeof fetch,
  onTransportEvent: (event: SmokeTransportEvent) => void = () => {},
) {
  // Strip --scenario and any value passed with it (e.g., --scenario coffee-shop or --scenario=coffee-shop)
  const pureArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--scenario=")) continue;
    if (a === "--scenario") {
      i++; // skip scenario argument value
      continue;
    }
    pureArgs.push(a);
  }
  const mode =
    pureArgs.length === 0
      ? "disabled"
      : pureArgs.length === 1 && pureArgs[0] === "--mock"
        ? "mock"
        : pureArgs.length === 1 && pureArgs[0] === "--live"
          ? "live"
          : null;
  if (!mode) throw new Error("OpenRouter smoke mode refused.");
  const settings = readOpenRouterSettings({
    SITEFORGE_OPENROUTER_MODEL: env.SITEFORGE_OPENROUTER_MODEL,
    SITEFORGE_OPENROUTER_OUTPUT_MODE: env.SITEFORGE_OPENROUTER_OUTPUT_MODE,
    SITEFORGE_OPENROUTER_TIMEOUT_MS: env.SITEFORGE_OPENROUTER_TIMEOUT_MS,
    SITEFORGE_OPENROUTER_FREE_ONLY_CONFIRMED:
      mode === "live" ? env.SITEFORGE_OPENROUTER_FREE_ONLY_CONFIRMED : "true",
  });
  if (
    mode === "live" &&
    (env.SITEFORGE_AI_PROVIDER !== "openrouter" ||
      env.SITEFORGE_AI_ALLOW_LIVE !== "true" ||
      env.SITEFORGE_AI_TEST_MODE === "true")
  )
    throw new Error("OpenRouter live prerequisites not satisfied.");
  const key =
    mode === "live"
      ? env.SITEFORGE_OPENROUTER_API_KEY
      : "synthetic-openrouter-smoke-only";
  if (mode === "live" && !key?.trim())
    throw new Error("OpenRouter live prerequisites not satisfied.");
  const fixture: typeof fetch = async () =>
    Response.json({
      model: settings.model,
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify(planFromMockContent(coffeeMockContent)),
          },
        },
      ],
      usage: { cost: 0 },
    });
  const budget = singleUseTransport(
    createSmokeTransportAudit(
      mode === "disabled"
        ? async () => {
            throw new Error("Smoke disabled");
          }
        : (transport ?? (mode === "mock" ? fixture : globalThis.fetch)),
      onTransportEvent,
    ),
  );
  const adapter =
    mode === "disabled"
      ? undefined
      : createOpenRouterProvider({
          ...settings,
          apiKey: key!,
          fetch: budget.fetch,
        });
  const provider =
    adapter && mode === "mock"
      ? {
          ...adapter,
          id: "mock" as const,
          telemetryProvider: "openrouter" as const,
        }
      : adapter;
  return {
    server: createGenerationServer({ provider, maxAttempts: 1, rateLimit: 1 }),
    mode,
    model: settings.model,
    outputMode: settings.outputMode,
    outboundRequests: budget.outboundRequests,
  };
}
