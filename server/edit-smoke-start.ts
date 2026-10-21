import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEditSmokeServer } from "./edit-smoke-startup";
import { OPENROUTER_EDIT_MODEL } from "../src/ai/edit-source";

// This ledger contains only numeric/public metadata, never content, headers or errors.
const root = fileURLToPath(new URL("../", import.meta.url));
const audit = {
  pid: process.pid,
  model: OPENROUTER_EDIT_MODEL,
  startedAt: new Date().toISOString(),
  transportCalls: 0,
  providerStatus: null as number | null,
  transportState: null as string | null,
  stopped: false,
};
const directory = resolve(root, "docs/smoke-observations");
const path = resolve(directory, `edit-launcher-${process.pid}.json`);
let ledgerReady = false;
const persist = () => {
  if (ledgerReady)
    writeFileSync(path, JSON.stringify(audit, null, 2) + "\n", { mode: 0o600 });
};

try {
  const smoke = createEditSmokeServer(
    process.env,
    process.argv.slice(2),
    globalThis.fetch,
    (event) => {
      Object.assign(audit, event);
      persist();
    },
  );
  // Drop the environment copy once the provider owns its in-memory credential.
  delete process.env.SITEFORGE_EDIT_OPENROUTER_API_KEY;
  mkdirSync(directory, { recursive: true });
  writeFileSync(path, JSON.stringify(audit, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  ledgerReady = true;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    clearTimeout(expiry);
    smoke.server.closeAllConnections();
    smoke.server.close(() => {
      audit.stopped = true;
      persist();
    });
  };
  const expiry = setTimeout(stop, 10 * 60_000);
  smoke.server.on("request", (request, response) => {
    if (request.method === "POST" && request.url === "/api/edit/propose")
      response.once("finish", () => {
        if (smoke.outboundRequests() === 1) setTimeout(stop, 250);
      });
  });
  smoke.server.once("error", () => {
    clearTimeout(expiry);
    audit.stopped = true;
    persist();
    console.error("Backend uji tidak dapat memakai port 5188.");
    process.exitCode = 1;
  });
  smoke.server.listen(5188, "127.0.0.1", () =>
    console.log(
      `Editing live siap di 127.0.0.1:5188; batas satu panggilan; pid=${process.pid}`,
    ),
  );
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch {
  delete process.env.SITEFORGE_EDIT_OPENROUTER_API_KEY;
  console.error(
    "Backend uji tidak aktif. Periksa input key dan konfigurasi lokal.",
  );
  process.exitCode = 1;
}
