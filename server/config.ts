import type { WebsiteGenerationProvider } from "../src/ai/website-generation";
import { createGeminiProvider } from "./gemini-provider";
import { createMockPlanProvider } from "./mock-website-plan";
import { readModelRouterConfig } from "./model-router-config";
import { createRoutedGenerationProvider } from "./routed-generation-provider";
import { createOpenRouterProvider } from "./openrouter-provider";
import { readOpenRouterSettings } from "./openrouter-settings";
/** Fail closed. A key alone never enables outbound requests. Construction does not fetch. */
export function providerFromEnvironment(
  env: NodeJS.ProcessEnv,
  transport?: typeof globalThis.fetch,
): WebsiteGenerationProvider | undefined {
  if (
    env.SITEFORGE_AI_PROVIDER === "mock" &&
    env.SITEFORGE_AI_TEST_MODE === "true"
  )
    return createMockPlanProvider();
  if (
    env.SITEFORGE_AI_PROVIDER === "openrouter" &&
    env.SITEFORGE_AI_ALLOW_LIVE === "true" &&
    env.SITEFORGE_AI_TEST_MODE !== "true"
  ) {
    const settings = readOpenRouterSettings(env);
    if (!env.SITEFORGE_OPENROUTER_API_KEY?.trim()) return undefined;
    return createOpenRouterProvider({
      ...settings,
      apiKey: env.SITEFORGE_OPENROUTER_API_KEY,
      fetch: transport,
    });
  }
  if (
    env.SITEFORGE_AI_PROVIDER === "gemini" &&
    env.SITEFORGE_AI_ALLOW_LIVE === "true"
  ) {
    const routing = readModelRouterConfig(env);
    if (!env.SITEFORGE_GEMINI_API_KEY?.trim()) return undefined;
    const factory = (model?: string) =>
      createGeminiProvider({
        apiKey: env.SITEFORGE_GEMINI_API_KEY!,
        model,
        fetch: transport,
      });
    return routing
      ? createRoutedGenerationProvider(routing, factory)
      : { ...factory(env.SITEFORGE_GEMINI_MODEL), attemptPolicy: "single" };
  }
  return undefined;
}
export function backendPort(env: NodeJS.ProcessEnv): number {
  const value = env.SITEFORGE_BACKEND_PORT ?? "5188";
  if (!/^\d{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535)
    throw new Error("Invalid backend port.");
  return Number(value);
}
