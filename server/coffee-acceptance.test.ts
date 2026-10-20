import { expect, test, vi } from "vitest";
import {
  coffeeAcceptance,
  coffeeMockContent,
} from "../scripts/coffee-acceptance-scenario";
import {
  buildCandidate,
  validateGenerationCandidate,
} from "../src/ai/generation-content";
import { createSmokeServer } from "./smoke-startup";
import { planFromMockContent } from "./mock-website-plan";

const input = { name: coffeeAcceptance.name, prompt: coffeeAcceptance.prompt };

test("fixed coffee acceptance is valid prompt-v2 content with three ordered blocks and empty contact", () => {
  const candidate = buildCandidate(
    JSON.stringify(coffeeMockContent),
    input,
    { id: "mock", model: "gemini-3.5-flash-lite" },
    "coffee-fixture",
  );
  expect(candidate.generation).toMatchObject({
    promptVersion: 2,
    mode: "mock",
  });
  expect(candidate.blocks.map((b) => b.type)).toEqual([
    ...coffeeAcceptance.blockTypes,
  ]);
  expect(candidate.blocks[2]).toMatchObject({
    email: "",
    phone: "",
    address: "",
  });
  expect(validateGenerationCandidate(candidate, coffeeAcceptance)).toEqual(
    candidate,
  );
});

for (const [label, block] of [
  [
    "email",
    {
      id: "contact",
      type: "contact",
      text: "Kontak",
      body: "",
      email: "PRIVATE@example.test",
      phone: "",
      address: "",
    },
  ],
  [
    "address",
    {
      id: "contact",
      type: "contact",
      text: "Kontak",
      body: "",
      email: "",
      phone: "",
      address: "PRIVATE-Invented address",
    },
  ],
  [
    "price",
    {
      id: "services",
      type: "features",
      text: "Pilihan kedai",
      layout: "grid",
      items: [{ title: "Menu", description: "Rp 999.000" }],
    },
  ],
] as const)
  test(
    "coffee single-request pipeline rejects invented " +
      label +
      " safely without retry",
    async () => {
      const transport = vi.fn<typeof fetch>(async () =>
        Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify(
                      planFromMockContent({ blocks: [block] }),
                    ),
                  },
                ],
              },
            },
          ],
        }),
      );
      const smoke = createSmokeServer({}, ["--mock"], transport);
      await new Promise<void>((resolve) =>
        smoke.server.listen(0, "127.0.0.1", resolve),
      );
      try {
        const address = smoke.server.address();
        if (!address || typeof address === "string")
          throw new Error("Missing test listener");
        const base = `http://127.0.0.1:${address.port}`;
        const status = await (
          await fetch(base + "/api/generation/status")
        ).json();
        const response = await fetch(base + "/api/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "http://127.0.0.1:5178",
            "X-SiteForge-Session": status.sessionToken,
          },
          body: JSON.stringify({
            name: coffeeAcceptance.name,
            prompt: coffeeAcceptance.prompt,
          }),
        });
        const result = await response.json();
        expect(response.status).toBe(502);
        expect(result.diagnostics).toMatchObject({
          outcome: "validation_error",
          providerAttempts: 1,
          transportCalls: 1,
          problem: {
            stage: "content_semantics",
            reason: "UNSUPPORTED_BUSINESS_FACT",
          },
        });
        expect(JSON.stringify(result)).not.toMatch(/PRIVATE/);
        expect(JSON.stringify(result.diagnostics.problem)).not.toContain(
          "999.000",
        );
        expect(transport).toHaveBeenCalledTimes(1);
        expect(smoke.outboundRequests()).toBe(1);
      } finally {
        smoke.server.closeAllConnections();
        await new Promise<void>((resolve) =>
          smoke.server.close(() => resolve()),
        );
      }
    },
  );
