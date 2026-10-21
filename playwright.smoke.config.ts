import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
const mode = process.env.SITEFORGE_OBSERVER_MODE;
const scenario = process.env.SITEFORGE_OBSERVER_SCENARIO ?? "smoke-two-blocks";
if (!["smoke-two-blocks", "coffee-shop"].includes(scenario))
  throw new Error("Unknown smoke scenario refused.");
if (mode !== "mock" && mode !== "live-approved")
  throw new Error("Smoke observer is disabled without an explicit mode.");
export default defineConfig({
  ...base,
  testMatch: "**/smoke-workflow.spec.ts",
  testIgnore: [],
  retries: 0,
  workers: 1,
  timeout: 135000,
  globalTimeout: 155000,
  outputDir: "test-results/smoke-runner",
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/smoke-runner-results.json" }],
  ],
  use: {
    ...base.use,
    trace: "off",
    actionTimeout: 5000,
    navigationTimeout: 10000,
  },
  webServer: [
    ...(mode === "mock"
      ? [
          {
            command:
              scenario === "coffee-shop"
                ? "node --import tsx scripts/mock-coffee-smoke.ts"
                : "node --import tsx server/smoke-start.ts --mock",
            url: "http://127.0.0.1:5188/api/generation/status",
            reuseExistingServer: false,
          },
        ]
      : []),
    {
      command:
        "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5189 --strictPort",
      url: "http://127.0.0.1:5189",
      reuseExistingServer: false,
    },
  ],
});
