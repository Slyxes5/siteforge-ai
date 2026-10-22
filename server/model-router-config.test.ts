import { expect, test } from "vitest";
import { readModelRouterConfig } from "./model-router-config";
import { GEMINI_GENERATION_MODEL_ORDER } from "./gemini-generation-profile";
const env = {
  SITEFORGE_AI_ROUTER_ENABLED: "true",
  SITEFORGE_GEMINI_MODEL: "gemini-3.5-flash-lite",
  SITEFORGE_AI_FALLBACK_MODELS: '["gemini-3.8-flash"]',
  SITEFORGE_AI_VERIFIED_MODELS: '["gemini-3.5-flash-lite","gemini-3.8-flash"]',
  SITEFORGE_AI_FREE_TIER_CONFIRMED: "true",
};
test.each([
  [
    "unverified alternatives",
    { SITEFORGE_AI_VERIFIED_MODELS: '["gemini-3.5-flash-lite"]' },
  ],
  [
    "missing free tier attestation",
    { SITEFORGE_AI_FREE_TIER_CONFIRMED: "false" },
  ],
  [
    "unsupported model",
    { SITEFORGE_AI_FALLBACK_MODELS: '["PRIVATE-unsupported"]' },
  ],
  [
    "duplicate model",
    { SITEFORGE_AI_FALLBACK_MODELS: '["gemini-3.5-flash-lite"]' },
  ],
  ["too many attempts", { SITEFORGE_AI_ROUTER_MAX_ATTEMPTS: "3" }],
  ["unbounded timeout", { SITEFORGE_AI_ROUTER_TOTAL_TIMEOUT_MS: "999999" }],
  ["inverted timeouts", { SITEFORGE_AI_ROUTER_TOTAL_TIMEOUT_MS: "5" }],
  ["malformed list", { SITEFORGE_AI_FALLBACK_MODELS: "PRIVATE" }],
] as const)(
  "refuses %s without credential lookup or reflecting values",
  (_name, patch) => {
    try {
      readModelRouterConfig({ ...env, ...patch });
      throw Error("Expected refusal");
    } catch (error) {
      expect((error as Error).message).toMatch(
        /^Model router configuration refused/,
      );
      expect(JSON.stringify(error)).not.toContain("PRIVATE");
    }
  },
);
test("router is disabled by default even with alternative configuration present", () => {
  expect(
    readModelRouterConfig({ ...env, SITEFORGE_AI_ROUTER_ENABLED: undefined }),
  ).toBeUndefined();
});

test("backend opt-in reads a verified model list with bounded defaults without credential access", () => {
  Object.defineProperty(env, "SITEFORGE_GEMINI_API_KEY", {
    get: () => {
      throw new Error("Must not read key");
    },
  });
  expect(readModelRouterConfig(env)).toMatchObject({
    models: ["gemini-3.5-flash-lite", "gemini-3.8-flash"],
    maxAttempts: 2,
    attemptTimeoutMs: 30000,
    totalTimeoutMs: 60000,
  });
});

test("opt-in router defaults to user-selected 3.8 then 3.5 and still requires verified eligibility", () => {
  const configured: NodeJS.ProcessEnv = {
    SITEFORGE_AI_ROUTER_ENABLED: "true",
    SITEFORGE_AI_VERIFIED_MODELS: JSON.stringify(GEMINI_GENERATION_MODEL_ORDER),
    SITEFORGE_AI_FREE_TIER_CONFIRMED: "true",
  };
  expect(readModelRouterConfig(configured)?.models).toEqual(
    GEMINI_GENERATION_MODEL_ORDER,
  );
  expect(
    readModelRouterConfig({
      ...configured,
      SITEFORGE_GEMINI_MODEL: "gemini-3.5-flash-lite",
    })?.models,
  ).toEqual(["gemini-3.5-flash-lite"]);
  expect(() =>
    readModelRouterConfig({
      ...configured,
      SITEFORGE_AI_VERIFIED_MODELS: undefined,
    }),
  ).toThrow();
  expect(
    readModelRouterConfig({
      ...configured,
      SITEFORGE_AI_ROUTER_ENABLED: undefined,
    }),
  ).toBeUndefined();
});
