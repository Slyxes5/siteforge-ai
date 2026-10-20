import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenRouterSmokeServer } from "./openrouter-smoke-startup";

// Explicit --live is required in addition to public flags. Default and --mock do not read a key.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  if (resolve(process.cwd()) !== root) throw Error("Wrong working directory");
  const port = Number(process.env.SITEFORGE_BACKEND_PORT ?? "5188");
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw Error("Invalid port");
  const sources = [
    "server/openrouter-smoke-start.ts",
    "server/openrouter-smoke-startup.ts",
    "server/openrouter-provider.ts",
    "server/openrouter-request.ts",
    "server/openrouter-settings.ts",
    "server/smoke-startup.ts",
    "server/smoke-transport-audit.ts",
    "server/generation-server.ts",
    "server/website-plan-request.ts",
    "server/provider-error.ts",
    "src/ai/website-plan.ts",
    "src/ai/generation-content.ts",
    "src/ai/website-generation.ts",
    "src/project-schema/project.ts",
  ];
  const hash = createHash("sha256");
  for (const path of sources)
    hash.update(path).update(readFileSync(resolve(root, path)));
  const audit = {
    pid: process.pid,
    provider: "openrouter",
    mode: "disabled",
    model: "",
    outputMode: "",
    contract: "website-plan-v1",
    sourceFingerprint: hash.digest("hex"),
    startedAt: new Date().toISOString(),
    transportCalls: 0,
    providerStatus: null as number | null,
    transportState: null as string | null,
    stopped: false,
  };
  const directory = resolve(root, "docs/smoke-observations");
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, `openrouter-launcher-${process.pid}.json`);
  const persist = () =>
    writeFileSync(path, JSON.stringify(audit, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
  let smoke;
  try {
    smoke = createOpenRouterSmokeServer(
      process.env,
      process.argv.slice(2),
      undefined,
      (event) => {
        audit.transportCalls = event.transportCalls;
        audit.providerStatus = event.providerStatus;
        audit.transportState = event.transportState;
        persist();
      },
    );
    audit.mode = smoke.mode;
    audit.model = smoke.model;
    audit.outputMode = smoke.outputMode;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("OpenRouter smoke start failed:", msg);
    audit.mode = "disabled";
    audit.model = "";
    audit.outputMode = "";
    persist();
    throw err;
  }
  // Refuse a pre-existing PID ledger rather than overwrite evidence or reset a used budget.
  writeFileSync(path, JSON.stringify(audit, null, 2) + "\n", {
    flag: "wx",
    encoding: "utf8",
    mode: 0o600,
  });
  smoke.server.on("error", (err) => {
    audit.stopped = true;
    persist();
    console.error("OpenRouter smoke startup refused:", err?.message || err);
    process.exitCode = 1;
  });
  smoke.server.listen(port, "127.0.0.1", () => {
    const address = smoke.server.address();
    if (address && typeof address !== "string")
      console.log(
        `http://127.0.0.1:${address.port} mode=${smoke.mode} provider=openrouter pid=${process.pid}`,
      );
  });
  const stop = () => {
    smoke.server.closeAllConnections();
    smoke.server.close(() => {
      audit.stopped = true;
      persist();
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("OpenRouter smoke startup refused:", msg);
    process.exitCode = 1;
  }
