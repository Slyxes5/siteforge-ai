import { defineConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const browserTemp = resolve(".browser-temp");
mkdirSync(browserTemp, { recursive: true });
process.env.TEMP = browserTemp;
process.env.TMP = browserTemp;
process.env.TMPDIR = browserTemp;
export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/observability.spec.ts", "**/smoke-workflow.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  outputDir: "test-results",
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:5189",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    // Network traces can retain session headers/raw bodies; keep evidence metadata-only.
    trace: "off",
  },
  webServer: [
    {
      command: "npm run backend:mock",
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
