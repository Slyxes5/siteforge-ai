import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { coffeeAcceptance } from "../scripts/coffee-acceptance-scenario";
test.each(["disabled", "mock"])(
  "actual OpenRouter CLI boots %s without credentials; one-request audit is preserved",
  async (mode) => {
    const env: NodeJS.ProcessEnv = {};
    for (const name of [
      "SystemRoot",
      "WINDIR",
      "PATH",
      "Path",
      "LOCALAPPDATA",
      "APPDATA",
      "USERPROFILE",
      "HOME",
    ])
      if (process.env[name]) env[name] = process.env[name];
    Object.assign(env, {
      TEMP: resolve(".browser-temp"),
      TMP: resolve(".browser-temp"),
      TMPDIR: resolve(".browser-temp"),
      SITEFORGE_BACKEND_PORT: "0",
      SITEFORGE_AI_PROVIDER: "openrouter",
      SITEFORGE_AI_ALLOW_LIVE: "true",
      SITEFORGE_AI_ROUTER_ENABLED: "true",
    });
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "server/openrouter-smoke-start.ts",
        ...(mode === "mock" ? ["--mock"] : []),
      ],
      { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] },
    );
    try {
      const output = await new Promise<string>((resolve, reject) => {
        let output = "";
        const timer = setTimeout(
          () => reject(Error("CLI startup timed out")),
          4000,
        );
        child.stdout.on("data", (chunk) => {
          output += chunk;
          if (output.includes(`mode=${mode}`)) {
            clearTimeout(timer);
            resolve(output);
          }
        });
        child.once("exit", () => {
          clearTimeout(timer);
          reject(Error("CLI exited without a ready server"));
        });
        child.once("error", reject);
      });
      expect(output).not.toContain("synthetic");
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      expect(url).toBeTruthy();
      const status = await (await fetch(url + "/api/generation/status")).json();
      expect(status).toMatchObject({
        mode,
        model: mode === "mock" ? "nvidia/nemotron-3.5-super-vl:free" : "",
      });
      const response = await fetch(url + "/api/generate", {
        method: "POST",
        headers: {
          Origin: "http://127.0.0.1:5189",
          "Content-Type": "application/json",
          "X-SiteForge-Session": status.sessionToken,
        },
        body: JSON.stringify({
          name: coffeeAcceptance.name,
          prompt: coffeeAcceptance.prompt,
        }),
      });
      expect(response.status).toBe(mode === "mock" ? 200 : 503);
      const audit = JSON.parse(
        readFileSync(
          `docs/smoke-observations/openrouter-launcher-${child.pid}.json`,
          "utf8",
        ),
      );
      expect(audit).toMatchObject({
        pid: child.pid,
        provider: "openrouter",
        mode,
        contract: "website-plan-v1",
        transportCalls: mode === "mock" ? 1 : 0,
      });
      expect(audit.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
      if (mode === "mock") {
        expect(audit.providerStatus).toBe(200);
        expect(audit.transportState).toBe("headers");
      }
    } finally {
      if (child.exitCode === null) {
        child.kill();
        await new Promise<void>((r) => child.once("exit", () => r()));
      }
    }
  },
);
