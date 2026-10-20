import { afterEach, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { createOpenRouterSmokeServer } from "./openrouter-smoke-startup";
import { coffeeAcceptance } from "../scripts/coffee-acceptance-scenario";
const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
async function connect(smoke: ReturnType<typeof createOpenRouterSmokeServer>) {
  servers.push(smoke.server);
  await new Promise<void>((r) => smoke.server.listen(0, "127.0.0.1", r));
  const address = smoke.server.address();
  if (!address || typeof address === "string") throw Error("No port");
  const base = `http://127.0.0.1:${address.port}`;
  const status = await (await fetch(base + "/api/generation/status")).json();
  return {
    status,
    post: () =>
      fetch(base + "/api/generate", {
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
      }),
  };
}
test("mock single-use launcher exercises OpenRouter envelope and compiler without credential lookup", async () => {
  const env = {
    SITEFORGE_AI_ALLOW_LIVE: "true",
    SITEFORGE_AI_ROUTER_ENABLED: "true",
  };
  Object.defineProperty(env, "SITEFORGE_OPENROUTER_API_KEY", {
    get: () => {
      throw Error("Must not read key");
    },
  });
  const smoke = createOpenRouterSmokeServer(env, ["--mock"]);
  const client = await connect(smoke);
  expect(client.status.mode).toBe("mock");
  const response = await client.post();
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.candidate.generation).toMatchObject({
    provider: "mock",
    mode: "mock",
    model: "nvidia/nemotron-3.5-super-vl:free",
  });
  expect(body.candidate.blocks.map((b: { type: string }) => b.type)).toEqual([
    "hero",
    "features",
    "contact",
  ]);
  expect(smoke.outboundRequests()).toBe(1);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60001);
  expect((await client.post()).status).toBe(502);
  expect(smoke.outboundRequests()).toBe(1);
});
test("default is disabled and never reads either provider key", async () => {
  const env = {
    SITEFORGE_AI_PROVIDER: "openrouter",
    SITEFORGE_AI_ALLOW_LIVE: "true",
  };
  for (const name of [
    "SITEFORGE_OPENROUTER_API_KEY",
    "SITEFORGE_GEMINI_API_KEY",
  ])
    Object.defineProperty(env, name, {
      get: () => {
        throw Error("Credential lookup forbidden");
      },
    });
  const smoke = createOpenRouterSmokeServer(env, []);
  const client = await connect(smoke);
  expect(client.status.mode).toBe("disabled");
  expect((await client.post()).status).toBe(503);
  expect(smoke.outboundRequests()).toBe(0);
});
test.each([400, 429, 503])(
  "HTTP%i never retries or refunds the single transport budget",
  async (status) => {
    const transport = vi.fn<typeof fetch>(
      async () => new Response("PRIVATE", { status }),
    );
    const smoke = createOpenRouterSmokeServer({}, ["--mock"], transport);
    const client = await connect(smoke);
    const response = await client.post();
    expect(response.status).toBe(502);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await response.text()).not.toContain("PRIVATE");
    expect(smoke.outboundRequests()).toBe(1);
  },
);
