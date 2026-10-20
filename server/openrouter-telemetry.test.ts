import { afterEach, expect, test } from "vitest";
import type { Server } from "node:http";
import { createGenerationServer } from "./generation-server";
import { planFromMockContent } from "./mock-website-plan";
import {
  coffeeAcceptance,
  coffeeMockContent,
} from "../scripts/coffee-acceptance-scenario";
import { generationDiagnosticsSchema } from "../src/ai/generation-observation";
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test("OpenRouter identity and upstream success status reach a strictly validated receipt", async () => {
  const server = createGenerationServer({
    provider: {
      id: "openrouter",
      model: "nvidia/nemotron-3.5-super-vl:free",
      outputFormat: "website-plan-v1",
      attemptPolicy: "single",
      generate: async (_r, _s, context) => {
        context?.onTransportCall?.();
        context?.onProviderStatus?.(200);
        return { text: JSON.stringify(planFromMockContent(coffeeMockContent)) };
      },
    },
    onGenerationEvent: () => {},
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No loopback");
  const base = `http://127.0.0.1:${address.port}`;
  const status = await (await fetch(base + "/api/generation/status")).json();
  const response = await fetch(base + "/api/generate", {
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
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.diagnostics).toMatchObject({
    provider: "openrouter",
    model: "nvidia/nemotron-3.5-super-vl:free",
    providerStatus: 200,
    transportCalls: 1,
  });
  expect(generationDiagnosticsSchema.safeParse(body.diagnostics).success).toBe(
    true,
  );
  expect(body.candidate.generation.provider).toBe("openrouter");
});
