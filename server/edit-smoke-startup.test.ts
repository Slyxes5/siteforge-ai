import { afterEach, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { createEditSmokeServer } from "./edit-smoke-startup";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((done) => {
          server.close(() => done());
          server.closeAllConnections();
        }),
    ),
  );
});
const env = {
  SITEFORGE_EDIT_PROVIDER: "openrouter",
  SITEFORGE_EDIT_ALLOW_LIVE: "true",
  SITEFORGE_EDIT_FREE_ONLY_CONFIRMED: "true",
  SITEFORGE_EDIT_OPENROUTER_API_KEY: "synthetic-test-only",
};

test("requires explicit launch and live gates before reading a credential", () => {
  const guarded = { ...env, SITEFORGE_EDIT_ALLOW_LIVE: "false" };
  Object.defineProperty(guarded, "SITEFORGE_EDIT_OPENROUTER_API_KEY", {
    get() {
      throw new Error("Credential must not be read");
    },
  });
  expect(() => createEditSmokeServer(guarded, [])).toThrow("--live");
  expect(() => createEditSmokeServer(guarded, ["--live"])).toThrow(
    "configuration",
  );
});

test("a failed provider attempt consumes the budget, with no generation activation or retry", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error("synthetic failure"));
  const smoke = createEditSmokeServer(env, ["--live"], transport);
  servers.push(smoke.server);
  await new Promise<void>((done) => smoke.server.listen(0, "127.0.0.1", done));
  const address = smoke.server.address();
  if (!address || typeof address === "string")
    throw new Error("No test address");
  const base = `http://127.0.0.1:${address.port}`;
  const status = await (await fetch(base + "/api/edit/status")).json();
  expect(status.mode).toBe("live");
  expect(
    await (await fetch(base + "/api/generation/status")).json(),
  ).toMatchObject({ mode: "disabled" });
  const post = () =>
    fetch(base + "/api/edit/propose", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:5178",
        "Content-Type": "application/json",
        "X-SiteForge-Session": status.sessionToken,
        "X-SiteForge-Edit-Mode": "live",
      },
      body: JSON.stringify({
        instruction: "Ubah judul menjadi Halo.",
        context: {
          name: "Synthetic demo",
          blocks: [{ id: "intro", type: "heading", text: "Before" }],
        },
      }),
    });
  expect((await post()).ok).toBe(false);
  expect(smoke.outboundRequests()).toBe(1);
  expect((await post()).ok).toBe(false);
  expect(transport).toHaveBeenCalledTimes(1);
});
