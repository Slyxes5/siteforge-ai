import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: "**/observability.spec.ts",
  outputDir: "test-results/observability",
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/observability-results.json" }],
  ],
  testIgnore: [],
  use: { ...base.use, trace: "off" },
  webServer: [
    {
      command: "node --import tsx server/observability-fixture.ts",
      url: "http://127.0.0.1:5188/api/generation/status",
      reuseExistingServer: false,
    },
    {
      command:
        "npm exec vite -- preview --host 127.0.0.1 --port 5189 --strictPort",
      url: "http://127.0.0.1:5189",
      reuseExistingServer: false,
    },
  ],
});
