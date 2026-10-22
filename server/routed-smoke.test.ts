import { afterEach, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { createSmokeServer } from "./smoke-startup";
import { GEMINI_GENERATION_MODEL_ORDER } from "./gemini-generation-profile";
import { planFromMockContent } from "./mock-website-plan";
import { coffeeMockContent } from "../scripts/coffee-acceptance-scenario";
import { validateGenerationCandidate } from "../src/ai/generation-content";

const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
const envelope = () =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [
            { text: JSON.stringify(planFromMockContent(coffeeMockContent)) },
          ],
        },
      },
    ],
  });
async function connect(transport?: typeof fetch) {
  const env: NodeJS.ProcessEnv = {
    SITEFORGE_GEMINI_MODEL: "gemini-3.5-flash-lite",
  };
  Object.defineProperty(env, "SITEFORGE_GEMINI_API_KEY", {
    get() {
      throw new Error("Mock must never read a credential");
    },
  });
  const smoke = createSmokeServer(env, ["--mock-routed"], transport);
  servers.push(smoke.server);
  await new Promise<void>((resolve) =>
    smoke.server.listen(0, "127.0.0.1", resolve),
  );
  const address = smoke.server.address();
  if (!address || typeof address === "string")
    throw new Error("No mock address");
  const base = `http://127.0.0.1:${address.port}`;
  const status = await (await fetch(base + "/api/generation/status")).json();
  return {
    smoke,
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
          name: "Cafe routing mock",
          prompt: "Synthetic cafe routing test only.",
        }),
      }),
  };
}

test("explicit routed mock starts with 3.8 and exercises 3.5 fallback without reading a key", async () => {
  const client = await connect();
  expect(client.status).toMatchObject({
    mode: "mock",
    model: GEMINI_GENERATION_MODEL_ORDER[0],
  });
  expect(client.smoke.outboundRequests()).toBe(0);
  const response = await client.post();
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.candidate.generation).toMatchObject({
    provider: "mock",
    mode: "mock",
    model: GEMINI_GENERATION_MODEL_ORDER[1],
  });
  expect(body.diagnostics.routing).toMatchObject({
    selectedModel: GEMINI_GENERATION_MODEL_ORDER[1],
    outboundRequests: 2,
  });
  expect(
    body.diagnostics.routing.attempts.map((a: { model: string }) => a.model),
  ).toEqual(GEMINI_GENERATION_MODEL_ORDER);
  expect(client.smoke.outboundRequests()).toBe(2);
  expect(validateGenerationCandidate(body.candidate).id).toBe(
    body.candidate.id,
  );
});

test("primary success uses one transport and no later submission can consume the fallback slot", async () => {
  const transport = vi.fn<typeof fetch>(async () => envelope());
  const client = await connect(transport);
  const response = await client.post();
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.candidate.generation.model).toBe(
    GEMINI_GENERATION_MODEL_ORDER[0],
  );
  expect(transport).toHaveBeenCalledTimes(1);
  expect(String(transport.mock.calls[0][0])).toContain(
    GEMINI_GENERATION_MODEL_ORDER[0],
  );
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61000);
  expect((await client.post()).status).toBe(502);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(client.smoke.outboundRequests()).toBe(1);
});

test.each([429, 503])(
  "HTTP %i switches once to 3.5 with actual-model provenance",
  async (status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              status: status === 429 ? "RESOURCE_EXHAUSTED" : "UNAVAILABLE",
            },
          },
          { status },
        ),
      )
      .mockImplementation(async () => envelope());
    const client = await connect(transport);
    const response = await client.post();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(
      transport.mock.calls.map(([url]) =>
        new URL(String(url)).pathname.split("/").at(-1),
      ),
    ).toEqual(
      GEMINI_GENERATION_MODEL_ORDER.map((model) => model + ":generateContent"),
    );
    expect(body.candidate.generation.model).toBe(
      GEMINI_GENERATION_MODEL_ORDER[1],
    );
    expect(body.diagnostics.transportCalls).toBe(2);
    expect(body.diagnostics.routing.attempts[1].reason).toBe(
      status === 429 ? "http_429" : "http_503",
    );
    expect(validateGenerationCandidate(body.candidate).id).toBe(
      body.candidate.id,
    );
  },
);

test.each([400, 401, 403, 500, "network", "invalid-output"])(
  "%s never triggers fallback or a later submission",
  async (failure) => {
    const transport = vi.fn<typeof fetch>(async () => {
      if (failure === "network") throw new Error("synthetic-private-error");
      if (failure === "invalid-output")
        return Response.json({
          candidates: [
            { finishReason: "STOP", content: { parts: [{ text: "{}" }] } },
          ],
        });
      if (typeof failure !== "number")
        throw new Error("Unknown synthetic failure");
      return Response.json(
        { error: { status: "INVALID_ARGUMENT" } },
        { status: failure },
      );
    });
    const client = await connect(transport);
    const response = await client.post();
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).not.toHaveProperty("candidate");
    expect(JSON.stringify(body)).not.toContain("synthetic-private-error");
    expect(transport).toHaveBeenCalledTimes(1);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61000);
    expect((await client.post()).status).toBe(502);
    expect(transport).toHaveBeenCalledTimes(1);
  },
);

test("two rejected models exhaust the lifetime budget and never invoke a third transport", async () => {
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 }),
  );
  const client = await connect(transport);
  expect((await client.post()).status).toBe(502);
  expect(transport).toHaveBeenCalledTimes(2);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61000);
  expect((await client.post()).status).toBe(502);
  expect(transport).toHaveBeenCalledTimes(2);
});

const syntheticLive = {
  SITEFORGE_AI_PROVIDER: "gemini",
  SITEFORGE_AI_ALLOW_LIVE: "true",
  SITEFORGE_AI_TEST_MODE: "false",
  SITEFORGE_SMOKE_FREE_TIER_CONFIRMED: "true",
  SITEFORGE_SMOKE_ROUTING_CONFIRMED: "true",
  SITEFORGE_GEMINI_API_KEY: "synthetic-only-not-a-real-key",
};
test("routed live needs its own explicit consent gate and construction never fetches", () => {
  const transport = vi.fn<typeof fetch>();
  expect(() =>
    createSmokeServer(
      { ...syntheticLive, SITEFORGE_SMOKE_ROUTING_CONFIRMED: undefined },
      ["--live-routed"],
      transport,
    ),
  ).toThrow();
  const smoke = createSmokeServer(syntheticLive, ["--live-routed"], transport);
  expect(smoke.models).toEqual(GEMINI_GENERATION_MODEL_ORDER);
  expect(smoke.outboundLimit).toBe(2);
  expect(smoke.server.listening).toBe(false);
  expect(transport).not.toHaveBeenCalled();
  const legacy = createSmokeServer(syntheticLive, ["--live"], transport);
  expect(legacy.routed).toBe(false);
  expect(legacy.outboundLimit).toBe(1);
});
test.each([
  "SITEFORGE_AI_PROVIDER",
  "SITEFORGE_AI_ALLOW_LIVE",
  "SITEFORGE_SMOKE_FREE_TIER_CONFIRMED",
  "SITEFORGE_GEMINI_API_KEY",
])("routed live still requires %s", (field) => {
  const transport = vi.fn<typeof fetch>();
  expect(() =>
    createSmokeServer(
      { ...syntheticLive, [field]: undefined },
      ["--live-routed"],
      transport,
    ),
  ).toThrow();
  expect(transport).not.toHaveBeenCalled();
});
