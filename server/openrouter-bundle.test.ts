import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
test.each([
  "SITEFORGE_OPENROUTER_API_KEY",
  "https://openrouter.ai/api/v1/chat/completions",
  "sk-or-v1-synthetic-bundle-guard-not-a-real-key",
])(
  "bundle guard rejects backend-only OpenRouter material without printing it %#",
  (content) => {
    mkdirSync(".browser-temp", { recursive: true });
    const directory = mkdtempSync(resolve(".browser-temp/bundle-guard-"));
    mkdirSync(resolve(directory, "dist"));
    writeFileSync(resolve(directory, "dist/index.js"), JSON.stringify(content));
    const result = spawnSync(
      process.execPath,
      [resolve("scripts/check-client-bundle.mjs")],
      { cwd: directory, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain(content);
  },
);
test("bundle guard permits honest public OpenRouter provenance labels", () => {
  mkdirSync(".browser-temp", { recursive: true });
  const directory = mkdtempSync(resolve(".browser-temp/bundle-guard-"));
  mkdirSync(resolve(directory, "dist"));
  writeFileSync(
    resolve(directory, "dist/index.js"),
    'const provider="openrouter";',
  );
  const result = spawnSync(
    process.execPath,
    [resolve("scripts/check-client-bundle.mjs")],
    { cwd: directory, encoding: "utf8" },
  );
  expect(result.status).toBe(0);
});
