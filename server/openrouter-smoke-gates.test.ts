import { expect, test, vi } from "vitest";
import { createOpenRouterSmokeServer } from "./openrouter-smoke-startup";
const ready = {
  SITEFORGE_AI_PROVIDER: "openrouter",
  SITEFORGE_AI_ALLOW_LIVE: "true",
  SITEFORGE_OPENROUTER_FREE_ONLY_CONFIRMED: "true",
  SITEFORGE_OPENROUTER_API_KEY: "synthetic-test-only",
};
test.each([
  {},
  { ...ready, SITEFORGE_AI_PROVIDER: "gemini" },
  { ...ready, SITEFORGE_AI_ALLOW_LIVE: "false" },
  { ...ready, SITEFORGE_AI_TEST_MODE: "true" },
  { ...ready, SITEFORGE_OPENROUTER_FREE_ONLY_CONFIRMED: "false" },
  { ...ready, SITEFORGE_OPENROUTER_MODEL: "openrouter/free" },
  { ...ready, SITEFORGE_OPENROUTER_API_KEY: "" },
])(
  "live factory refuses incomplete/unsafe prerequisites without dispatch %#",
  (env) => {
    const transport = vi.fn<typeof fetch>();
    expect(() =>
      createOpenRouterSmokeServer(env, ["--live"], transport),
    ).toThrow();
    expect(transport).not.toHaveBeenCalled();
  },
);
test.each([["--mock", "--live"], ["--live", "--live"], ["--unknown"]])(
  "ambiguous launcher modes are refused %#",
  (...args) => {
    const transport = vi.fn<typeof fetch>();
    expect(() => createOpenRouterSmokeServer(ready, args, transport)).toThrow();
    expect(transport).not.toHaveBeenCalled();
  },
);
test("constructing explicit synthetic live factory never dispatches and bypasses inherited router flags", () => {
  const transport = vi.fn<typeof fetch>();
  const smoke = createOpenRouterSmokeServer(
    {
      ...ready,
      SITEFORGE_AI_ROUTER_ENABLED: "true",
      SITEFORGE_AI_FALLBACK_MODELS: '["gemini-3.8-flash"]',
    },
    ["--live"],
    transport,
  );
  expect(smoke.mode).toBe("live");
  expect(smoke.outboundRequests()).toBe(0);
  expect(transport).not.toHaveBeenCalled();
  expect(smoke.server.listening).toBe(false);
});
