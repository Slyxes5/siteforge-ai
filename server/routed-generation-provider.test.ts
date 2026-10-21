import { afterEach, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { createRoutedGenerationProvider } from "./routed-generation-provider";
import { createGeminiProvider } from "./gemini-provider";
import { createGenerationServer } from "./generation-server";
import { planFromMockContent } from "./mock-website-plan";
import {
  coffeeAcceptance,
  coffeeMockContent,
} from "../scripts/coffee-acceptance-scenario";
import { validateGenerationCandidate } from "../src/ai/generation-content";
import { generationDiagnosticsSchema } from "../src/ai/generation-observation";
const models = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];
const config = {
  models,
  verifiedModels: models,
  freeTierConfirmed: true as const,
  maxAttempts: 2,
  attemptTimeoutMs: 500,
  totalTimeoutMs: 1500,
};
const envelope = (content = planFromMockContent(coffeeMockContent)) =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(content) }] },
      },
    ],
  });
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
async function setup(transport: typeof fetch) {
  const routed = createRoutedGenerationProvider(config, (model) =>
    createGeminiProvider({
      model,
      apiKey: "synthetic-test-only",
      fetch: transport,
    }),
  );
  const server = createGenerationServer({
    provider: { ...routed, id: "mock" },
    maxAttempts: 2,
    onGenerationEvent: () => {},
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No address");
  const base = `http://127.0.0.1:${address.port}`;
  const status = await (await fetch(base + "/api/generation/status")).json();
  return () =>
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
    });
}
test.each([400, 401, 403, 429, 503])(
  "HTTP %i terminates without stacked server retries or fallback loops",
  async (status) => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          error: {
            code: status,
            status:
              status === 503
                ? "UNAVAILABLE"
                : status === 429
                  ? "RESOURCE_EXHAUSTED"
                  : status === 400
                    ? "INVALID_ARGUMENT"
                    : "PERMISSION_DENIED",
          },
        },
        { status },
      ),
    );
    const post = await setup(transport);
    const response = await post();
    const result = await response.json();
    expect(response.status).toBe(502);
    expect(transport).toHaveBeenCalledTimes(
      status === 429 || status === 503 ? 2 : 1,
    );
    expect(result.diagnostics.transportCalls).toBe(transport.mock.calls.length);
    expect(result.diagnostics.routing.selectedModel).toBeNull();
    expect(result).not.toHaveProperty("candidate");
  },
);
test("primary success validates the same Website Plan without fallback", async () => {
  const transport = vi.fn<typeof fetch>(async () => envelope());
  const post = await setup(transport);
  const body = await (await post()).json();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(body.candidate.generation.model).toBe(models[0]);
  expect(body.diagnostics.schemaValidation).toBe("valid");
});
test("invalid structured output after successful provider response never triggers fallback", async () => {
  const transport = vi.fn<typeof fetch>(async () => envelope({ blocks: [] }));
  const post = await setup(transport);
  const response = await post();
  const body = await response.json();
  expect(response.status).toBe(502);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(body.diagnostics.schemaValidation).toBe("invalid");
  expect(body.diagnostics.routing.selectedModel).toBe(models[0]);
});
test("fallback output cannot invent contact facts", async () => {
  const content = planFromMockContent(coffeeMockContent);
  content.blocks[2].email = "PRIVATE@example.test";
  const transport = vi.fn<typeof fetch>(async (url) =>
    String(url).includes(models[0])
      ? new Response("", { status: 503 })
      : envelope(content),
  );
  const post = await setup(transport);
  const response = await post();
  const body = await response.json();
  expect(response.status).toBe(502);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(body.diagnostics.problem.reason).toBe("UNSUPPORTED_BUSINESS_FACT");
  expect(JSON.stringify(body)).not.toContain("PRIVATE");
});
test("invalid request and unsupported deployment configuration fail before outbound", async () => {
  const transport = vi.fn<typeof fetch>();
  const provider = createRoutedGenerationProvider(config, (model) =>
    createGeminiProvider({
      model,
      apiKey: "synthetic-test-only",
      fetch: transport,
    }),
  );
  await expect(
    provider.generate(
      { name: "", prompt: "Synthetic" },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "REQUEST_CONTRACT" });
  const factory = vi.fn();
  expect(() =>
    createRoutedGenerationProvider(
      { ...config, models: ["gemini-unsupported"] },
      factory,
    ),
  ).toThrow("configuration refused");
  expect(factory).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
});

test("fallback result compiles with actual selected-model provenance and safe routing receipt", async () => {
  const transport = vi.fn<typeof fetch>(async (url) =>
    String(url).includes(models[0])
      ? Response.json(
          { error: { code: 503, status: "UNAVAILABLE" } },
          { status: 503 },
        )
      : envelope(),
  );
  const post = await setup(transport);
  const response = await post();
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(body.candidate.generation.model).toBe(models[1]);
  expect(body.candidate.blocks.map((b: { type: string }) => b.type)).toEqual([
    "hero",
    "features",
    "contact",
  ]);
  expect(validateGenerationCandidate(body.candidate, coffeeAcceptance)).toEqual(
    body.candidate,
  );
  expect(body.diagnostics).toMatchObject({
    providerAttempts: 2,
    transportCalls: 2,
    routing: { selectedModel: models[1], outboundRequests: 2 },
  });
  expect(generationDiagnosticsSchema.safeParse(body.diagnostics).success).toBe(
    true,
  );
  expect(body.diagnostics).not.toHaveProperty("providerStatus");
});
