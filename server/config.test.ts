import { expect, test, vi } from "vitest";
import { providerFromEnvironment, backendPort } from "./config";
import { compileWebsitePlan } from "../src/ai/website-plan";
test.each([
  {},
  { SITEFORGE_GEMINI_API_KEY: "unit-test-only-key" },
  {
    SITEFORGE_AI_PROVIDER: "gemini",
    SITEFORGE_GEMINI_API_KEY: "unit-test-only-key",
  },
  { SITEFORGE_AI_PROVIDER: "gemini", SITEFORGE_AI_ALLOW_LIVE: "true" },
  { SITEFORGE_AI_PROVIDER: "mock" },
  { SITEFORGE_AI_PROVIDER: "mock", SITEFORGE_AI_TEST_MODE: "false" },
])(
  "environment defaults disabled unless every explicit guard is met",
  (env) => {
    const transport = vi.fn<typeof fetch>();
    expect(providerFromEnvironment(env, transport)).toBeUndefined();
    expect(transport).not.toHaveBeenCalled();
  },
);
test("explicit test mock provides valid fixture with name only and no prompt echo", async () => {
  const transport = vi.fn<typeof fetch>();
  const p = providerFromEnvironment(
    { SITEFORGE_AI_PROVIDER: "mock", SITEFORGE_AI_TEST_MODE: "true" },
    transport,
  )!;
  expect(p.id).toBe("mock");
  expect(p.model).toBe("test-fixture");
  const input = { name: "Demo", prompt: "private user prompt" };
  const output = await p.generate(input, new AbortController().signal);
  expect(output.text).toContain("Demo");
  expect(output.text).not.toContain(input.prompt);
  expect(
    compileWebsitePlan(output.text, input, p, "fixture-id").generation,
  ).toMatchObject({ mode: "mock" });
  expect(transport).not.toHaveBeenCalled();
});
test("explicit guarded live construction does not make a request", () => {
  const transport = vi.fn<typeof fetch>();
  const p = providerFromEnvironment(
    {
      SITEFORGE_AI_PROVIDER: "gemini",
      SITEFORGE_AI_ALLOW_LIVE: "true",
      SITEFORGE_GEMINI_API_KEY: "unit-test-only-key",
      SITEFORGE_GEMINI_MODEL: "gemini-test",
    },
    transport,
  )!;
  expect(p.id).toBe("gemini");
  expect(p.model).toBe("gemini-test");
  expect(transport).not.toHaveBeenCalled();
});
test("explicit verified backend routing configuration composes real adapters without implicit live dispatch", async () => {
  const models = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];
  const env = {
    SITEFORGE_AI_PROVIDER: "gemini",
    SITEFORGE_AI_ALLOW_LIVE: "true",
    SITEFORGE_GEMINI_API_KEY: "synthetic-only",
    SITEFORGE_GEMINI_MODEL: models[0],
    SITEFORGE_AI_ROUTER_ENABLED: "true",
    SITEFORGE_AI_FREE_TIER_CONFIRMED: "true",
    SITEFORGE_AI_FALLBACK_MODELS: JSON.stringify(models.slice(1)),
    SITEFORGE_AI_VERIFIED_MODELS: JSON.stringify(models),
  };
  const transport = vi.fn<typeof fetch>(
    async () => new Response("", { status: 400 }),
  );
  const provider = providerFromEnvironment(env, transport)!;
  expect(provider.attemptPolicy).toBe("router");
  expect(provider.model).toBe(models[0]);
  expect(transport).not.toHaveBeenCalled();
  await expect(
    provider.generate(
      { name: "Demo", prompt: "Synthetic" },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect(transport).toHaveBeenCalledTimes(1);
});

test("normal backend defaults to a single adapter attempt and never silently opts into routing", async () => {
  let calls = 0;
  const provider = providerFromEnvironment(
    {
      SITEFORGE_AI_PROVIDER: "gemini",
      SITEFORGE_AI_ALLOW_LIVE: "true",
      SITEFORGE_GEMINI_API_KEY: "synthetic-only",
    },
    async () => {
      calls++;
      return new Response("", { status: 503 });
    },
  )!;
  expect(provider.attemptPolicy).toBe("single");
  await expect(
    provider.generate(
      { name: "Demo", prompt: "Synthetic" },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ status: 503 });
  expect(calls).toBe(1);
});

test("validates configured port without echoing invalid value", () => {
  expect(backendPort({})).toBe(5188);
  expect(backendPort({ SITEFORGE_BACKEND_PORT: "5189" })).toBe(5189);
  for (const value of ["0", "-1", "65536", "abc", "5188oops"])
    expect(() => backendPort({ SITEFORGE_BACKEND_PORT: value })).toThrow(
      "Invalid backend port.",
    );
});
