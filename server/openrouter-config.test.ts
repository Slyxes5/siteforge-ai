import { expect, test, vi } from "vitest";
import { providerFromEnvironment } from "./config";
const env = {
  SITEFORGE_AI_PROVIDER: "openrouter",
  SITEFORGE_AI_ALLOW_LIVE: "true",
  SITEFORGE_OPENROUTER_FREE_ONLY_CONFIRMED: "true",
  SITEFORGE_OPENROUTER_API_KEY: "synthetic-test-only",
};
test("explicit OpenRouter selection constructs only the free single-attempt adapter without transport", () => {
  const transport = vi.fn<typeof fetch>();
  const provider = providerFromEnvironment(env, transport);
  expect(provider).toMatchObject({
    id: "openrouter",
    model: "nvidia/nemotron-3.5-super-vl:free",
    outputFormat: "website-plan-v1",
    attemptPolicy: "single",
  });
  expect(transport).not.toHaveBeenCalled();
});
test.each([
  {},
  { SITEFORGE_AI_PROVIDER: "openrouter" },
  { ...env, SITEFORGE_AI_ALLOW_LIVE: "false" },
  { ...env, SITEFORGE_AI_TEST_MODE: "true" },
])("disabled/unselected modes never look up OpenRouter key %#", (value) => {
  Object.defineProperty(value, "SITEFORGE_OPENROUTER_API_KEY", {
    get: () => {
      throw Error("Key lookup forbidden");
    },
  });
  expect(providerFromEnvironment(value, vi.fn<typeof fetch>())).toBeUndefined();
});
test("invalid public settings are rejected before looking up a key", () => {
  const value = {
    ...env,
    SITEFORGE_OPENROUTER_MODEL: "nvidia/nemotron-3.5-super-vl",
  };
  Object.defineProperty(value, "SITEFORGE_OPENROUTER_API_KEY", {
    get: () => {
      throw Error("Must not read key");
    },
  });
  expect(() => providerFromEnvironment(value, vi.fn<typeof fetch>())).toThrow(
    "OpenRouter configuration refused",
  );
});
test("Gemini selection never accesses the unrelated OpenRouter credential", () => {
  const value = {
    SITEFORGE_AI_PROVIDER: "gemini",
    SITEFORGE_AI_ALLOW_LIVE: "true",
    SITEFORGE_GEMINI_API_KEY: "synthetic-test-only",
  };
  Object.defineProperty(value, "SITEFORGE_OPENROUTER_API_KEY", {
    get: () => {
      throw Error("Wrong provider key");
    },
  });
  expect(providerFromEnvironment(value, vi.fn<typeof fetch>())?.id).toBe(
    "gemini",
  );
});
