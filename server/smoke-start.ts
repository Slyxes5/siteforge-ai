import { backendPort } from "./config";
import { createSmokeServer } from "./smoke-startup";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
// Disabled and mock selection never read the environment credential.
try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== "--live") {
    // Remove only the child process copy; never read or alter the parent shell key.
    delete process.env.SITEFORGE_GEMINI_API_KEY;
  }
  const folder = resolve("docs/smoke-observations");
  mkdirSync(folder, { recursive: true });
  const auditPath = resolve(folder, `transport-${process.pid}.json`);
  const startedAt = new Date().toISOString();
  const sourceFingerprints = Object.fromEntries(
    [
      "server/smoke-start.ts",
      "server/smoke-startup.ts",
      "server/smoke-transport-audit.ts",
      "server/gemini-provider.ts",
      "server/website-plan-request.ts",
      "src/ai/website-plan.ts",
      "server/generation-server.ts",
    ].map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(resolve(file)))
        .digest("hex"),
    ]),
  );
  const audit = {
    pid: process.pid,
    startedAt,
    contract: "website-plan-v1",
    model: process.env.SITEFORGE_GEMINI_MODEL ?? "gemini-3.5-flash-lite",
    sourceFingerprints,
    transportCalls: 0,
    providerStatus: null as number | null,
    transportState: "not_dispatched",
    updatedAt: startedAt,
    stopped: false,
  };
  writeFileSync(auditPath, JSON.stringify(audit, null, 2), {
    flag: "wx",
    flush: true,
  });
  const persistAudit = () =>
    writeFileSync(auditPath, JSON.stringify(audit, null, 2), { flush: true });
  const smoke = createSmokeServer(process.env, args, undefined, (event) => {
    Object.assign(audit, event, { updatedAt: new Date().toISOString() });
    persistAudit();
  });
  const port = backendPort(process.env);
  smoke.server.on("error", () => {
    console.error(
      "Smoke launcher could not start. Check the mode prerequisites and whether its loopback port is free.",
    );
    process.exitCode = 1;
  });
  smoke.server.listen(port, "127.0.0.1", () => {
    console.log(
      `http://127.0.0.1:${port} mode=${smoke.mode} model=${smoke.model} contract=website-plan-v1 pid=${process.pid} maxAttempts=1 outboundLimit=1`,
    );
    if (smoke.mode === "mock")
      console.log(
        "TEST MOCK transport only. No real Gemini request will be sent.",
      );
  });
  const stop = () => {
    smoke.server.close(() => {
      audit.stopped = true;
      audit.updatedAt = new Date().toISOString();
      persistAudit();
      console.log(
        `Smoke launcher stopped. mode=${smoke.mode} transportCalls=${smoke.outboundRequests()}`,
      );
    });
    smoke.server.closeAllConnections();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch {
  console.error(
    "Smoke launcher refused to start. Check the mode prerequisites and local configuration.",
  );
  process.exitCode = 1;
}
