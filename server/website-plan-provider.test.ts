import { expect, test, vi } from "vitest";
import { createGeminiProvider } from "./gemini-provider";
import { generatedContentJsonSchema } from "../src/ai/generation-content";

const input = { name: "Synthetic", prompt: "Hero then contact in Indonesian" };
test("default adapter requests a single-shape Website Plan, not canonical block variants", async () => {
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
  const provider = createGeminiProvider({
    apiKey: "synthetic-test-only",
    fetch: transport,
  });
  await provider.generate(input, new AbortController().signal);
  const body = JSON.parse(transport.mock.calls[0][1]!.body as string);
  expect(body.generationConfig.responseJsonSchema).not.toEqual(
    generatedContentJsonSchema,
  );
  expect(
    body.generationConfig.responseJsonSchema.properties.blocks.items.anyOf,
  ).toBeUndefined();
  expect(provider).toMatchObject({ outputFormat: "website-plan-v1" });
  expect(transport).toHaveBeenCalledTimes(1);
});
