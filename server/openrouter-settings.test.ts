import { expect, test } from "vitest";
import { readOpenRouterSettings } from "./openrouter-settings";
const env = { SITEFORGE_OPENROUTER_FREE_ONLY_CONFIRMED: "true" };
test("explicit free-only settings resolve conservative JSON mode without reading a key", () => {
  Object.defineProperty(env, "SITEFORGE_OPENROUTER_API_KEY", {
    get: () => {
      throw Error("Must not read key");
    },
  });
  expect(readOpenRouterSettings(env)).toEqual({
    model: "nvidia/nemotron-3.5-super-vl:free",
    outputMode: "prompt-json",
    timeoutMs: 120000,
  });
});
test.each([
  { SITEFORGE_OPENROUTER_MODEL: "nvidia/nemotron-3.5-super-vl" },
  { SITEFORGE_OPENROUTER_MODEL: "openrouter/free" },
  { SITEFORGE_OPENROUTER_MODEL: "PRIVATE" },
  { SITEFORGE_OPENROUTER_OUTPUT_MODE: "auto" },
  { SITEFORGE_OPENROUTER_TIMEOUT_MS: "999999" },
  { SITEFORGE_OPENROUTER_TIMEOUT_MS: "120001" },
  { SITEFORGE_OPENROUTER_FREE_ONLY_CONFIRMED: "false" },
])("invalid/paid/unconfirmed configuration is refused safely %#", (patch) => {
  expect(() => readOpenRouterSettings({ ...env, ...patch })).toThrow(
    "OpenRouter configuration refused",
  );
});

test.each(["1", "45000", "120000"])(
  "bounded timeout %s is accepted",
  (timeoutMs) => {
    expect(
      readOpenRouterSettings({
        ...env,
        SITEFORGE_OPENROUTER_TIMEOUT_MS: timeoutMs,
      }).timeoutMs,
    ).toBe(Number(timeoutMs));
  },
);
