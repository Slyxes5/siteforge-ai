import { expect, test, vi } from "vitest";
import { GENERATION_SYSTEM_PROMPT_V2 } from "./generation-prompt";
import { createGeminiProvider } from "./gemini-provider";

test("adapter sends reusable v2 instruction without changing structured-output budget", async () => {
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: '{"blocks":[]}' }] },
        },
      ],
    }),
  );
  await createGeminiProvider({
    contract: "m2c",
    apiKey: "synthetic-test-only",
    fetch: transport,
  }).generate(
    { name: "Demo", prompt: "Exactly two blocks: hero then contact" },
    new AbortController().signal,
  );
  const body = JSON.parse(transport.mock.calls[0][1]!.body as string);
  expect(GENERATION_SYSTEM_PROMPT_V2).toContain("prompt-version: 2");
  expect(body.systemInstruction.parts[0].text).toBe(
    GENERATION_SYSTEM_PROMPT_V2,
  );
  expect(body.generationConfig.maxOutputTokens).toBe(4096);
  for (const rule of [
    "language",
    "category",
    "order",
    "two blocks",
    "12 blocks",
    "features",
    "contact",
    "grid",
    "list",
    "1..6",
    "80",
    "240",
    "320",
    "500",
    "/sample-landscape.svg",
    "untrusted",
    "booking",
    "payment",
    "placeholder",
  ]) {
    expect(GENERATION_SYSTEM_PROMPT_V2).toContain(rule);
  }
});
