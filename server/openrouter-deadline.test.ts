import { afterEach, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { createOpenRouterProvider } from "./openrouter-provider";
import { createOpenRouterSmokeServer } from "./openrouter-smoke-startup";
import { createGenerationServer } from "./generation-server";
import { OPENROUTER_FREE_MODEL } from "./openrouter-request";
import { planFromMockContent } from "./mock-website-plan";
import {
  coffeeAcceptance,
  coffeeMockContent,
} from "../scripts/coffee-acceptance-scenario";
import {
  generationDiagnosticsSchema,
  providerTimingsSchema,
  type ProviderTimings,
} from "../src/ai/generation-observation";

const servers: Server[] = [];
const input = { name: coffeeAcceptance.name, prompt: coffeeAcceptance.prompt };
const envelope = () =>
  JSON.stringify({
    model: OPENROUTER_FREE_MODEL,
    choices: [
      {
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: JSON.stringify(planFromMockContent(coffeeMockContent)),
        },
      },
    ],
    usage: { cost: 0 },
  });
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
async function post(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No loopback");
  const base = `http://127.0.0.1:${address.port}`;
  const status = await (await fetch(base + "/api/generation/status")).json();
  return fetch(base + "/api/generate", {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:5189",
      "Content-Type": "application/json",
      "X-SiteForge-Session": status.sessionToken,
    },
    body: JSON.stringify(input),
  });
}

test("OpenRouter smoke accepts a response after the old 45s/90s limits through compiler and receipt", async () => {
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const transport = vi.fn<typeof fetch>(async () => {
    now += 110000;
    return new Response(envelope());
  });
  const smoke = createOpenRouterSmokeServer(
    {
      SITEFORGE_AI_PROVIDER: "openrouter",
      SITEFORGE_AI_ALLOW_LIVE: "true",
      SITEFORGE_OPENROUTER_FREE_ONLY_CONFIRMED: "true",
      SITEFORGE_OPENROUTER_API_KEY: "synthetic-only",
    },
    ["--live"],
    transport,
  );
  const response = await post(smoke.server);
  const result = await response.json();
  expect(response.status).toBe(200);
  expect(
    result.candidate.blocks.map((block: { type: string }) => block.type),
  ).toEqual(["hero", "features", "contact"]);
  expect(result.candidate.generation.provider).toBe("openrouter");
  expect(
    generationDiagnosticsSchema.safeParse(result.diagnostics).success,
  ).toBe(true);
  expect(result.diagnostics.providerTimings).toMatchObject({
    headersMs: expect.any(Number),
    firstByteMs: expect.any(Number),
    bodyCompleteMs: expect.any(Number),
    responseCompleteMs: expect.any(Number),
  });
  expect(smoke.outboundRequests()).toBe(1);
  expect(transport).toHaveBeenCalledTimes(1);
});

test.each(["openrouter", "gemini"] as const)(
  "%s backend keeps its own elapsed attempt budget",
  async (id) => {
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const generate = vi.fn(async () => {
      now += 60000;
      return { text: JSON.stringify(planFromMockContent(coffeeMockContent)) };
    });
    const server = createGenerationServer({
      provider: {
        id,
        model: "synthetic",
        outputFormat: "website-plan-v1",
        attemptPolicy: "single",
        generate,
      },
      onGenerationEvent: () => {},
    });
    expect((await post(server)).status).toBe(id === "openrouter" ? 200 : 504);
    expect(generate).toHaveBeenCalledTimes(1);
  },
);

test("default adapter waits through 90s but aborts a stalled body at 120s", async () => {
  vi.useFakeTimers();
  const timings: ProviderTimings[] = [];
  const cancel = vi.fn();
  const transport = vi.fn<typeof fetch>(
    async () => new Response(new ReadableStream({ cancel })),
  );
  let settled = false;
  const pending = createOpenRouterProvider({
    apiKey: "synthetic-only",
    fetch: transport,
  })
    .generate(input, new AbortController().signal, {
      onProviderTimings: (t) => timings.push(t),
    })
    .catch((error) => error)
    .finally(() => {
      settled = true;
    });
  await vi.advanceTimersByTimeAsync(90001);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(30000);
  expect(await pending).toMatchObject({ name: "TimeoutError" });
  expect(timings).toEqual([{ headersMs: expect.any(Number) }]);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

test("body timing separates first bytes from body completion and envelope parse", async () => {
  let elapsed = 0;
  vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  const timings: ProviderTimings[] = [];
  const bytes = new TextEncoder().encode(envelope());
  let chunk = 0;
  const transport: typeof fetch = async () => {
    elapsed = 10;
    return new Response(
      new ReadableStream(
        {
          pull(controller) {
            if (chunk++ === 0) {
              elapsed = 20;
              controller.enqueue(bytes);
            } else {
              elapsed = 30;
              controller.close();
            }
          },
        },
        { highWaterMark: 0 },
      ),
    );
  };
  await createOpenRouterProvider({
    apiKey: "synthetic-only",
    fetch: transport,
  }).generate(input, new AbortController().signal, {
    onProviderTimings: (t) => timings.push(t),
  });
  expect(timings).toEqual([
    { headersMs: 10 },
    { headersMs: 10, firstByteMs: 20 },
    { headersMs: 10, firstByteMs: 20, bodyCompleteMs: 30 },
    {
      headersMs: 10,
      firstByteMs: 20,
      bodyCompleteMs: 30,
      responseCompleteMs: 30,
    },
  ]);
});

test("timing observer failure cannot change valid generation", async () => {
  await expect(
    createOpenRouterProvider({
      apiKey: "synthetic-only",
      fetch: async () => new Response(envelope()),
    }).generate(input, new AbortController().signal, {
      onProviderTimings: () => {
        throw Error("private observer error");
      },
    }),
  ).resolves.toHaveProperty("text");
});

test("timeout receipt retains only reached timing stages and ignores a late update", async () => {
  let late!: () => void;
  const events: unknown[] = [];
  const server = createGenerationServer({
    timeoutMs: 10,
    provider: {
      id: "openrouter",
      model: "synthetic",
      attemptPolicy: "single",
      generate: (_input, _signal, context) => {
        context?.onTransportCall?.();
        context?.onProviderStatus?.(200);
        context?.onProviderTimings?.({ headersMs: 1 });
        context?.onProviderTimings?.({ headersMs: 1, firstByteMs: 2 });
        late = () =>
          context?.onProviderTimings?.({
            headersMs: 1,
            firstByteMs: 2,
            bodyCompleteMs: 100,
          });
        return new Promise(() => {});
      },
    },
    onGenerationEvent: (event) => events.push(event),
  });
  const response = await post(server);
  const result = await response.json();
  expect(response.status).toBe(504);
  expect(result.diagnostics).toMatchObject({
    outcome: "timeout",
    transportCalls: 1,
    providerStatus: 200,
    providerTimings: { headersMs: 1, firstByteMs: 2 },
  });
  expect(result.diagnostics.providerTimings.bodyCompleteMs).toBeUndefined();
  expect(
    generationDiagnosticsSchema.safeParse(result.diagnostics).success,
  ).toBe(true);
  const before = JSON.stringify(events);
  late();
  expect(JSON.stringify(events)).toBe(before);
});

test.each([
  { headersMs: -1 },
  { headersMs: NaN },
  { headersMs: 1, raw: "private" },
  { headersMs: 10, firstByteMs: 5 },
  { headersMs: 1, responseCompleteMs: 3 },
])("timing metadata rejects invalid or non-allowlisted values %#", (value) => {
  expect(providerTimingsSchema.safeParse(value).success).toBe(false);
});
