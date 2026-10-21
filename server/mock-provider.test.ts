import { expect, test } from "vitest";
import { createMockProvider } from "./mock-provider";
import { generatedContentSchema } from "../src/ai/generation-content";
import { assertGroundedContent } from "../src/ai/generation-grounding";
const signal = () => new AbortController().signal;
const cases = [
  "coffee shop",
  "barber",
  "rental mobil",
  "portfolio",
  "business",
];
test("category fixtures vary composition, copy and layout but stay honest and local", async () => {
  const provider = createMockProvider();
  expect({ id: provider.id, model: provider.model }).toEqual({
    id: "mock",
    model: "test-fixture",
  });
  const outputs = await Promise.all(
    cases.map(async (prompt) => {
      const input = { name: "Demo", prompt };
      const { text } = await provider.generate(input, signal());
      expect((await provider.generate(input, signal())).text).toBe(text);
      const { blocks } = JSON.parse(text);
      expect(generatedContentSchema.safeParse({ blocks }).success).toBe(true);
      expect(blocks[0]).toMatchObject({ type: "hero", text: "Demo" });
      expect(text).toMatch(/mock|fixture/i);
      expect(text).toMatch(/not.*real AI|bukan.*AI/i);
      expect(blocks.length).toBeLessThanOrEqual(12);
      expect(blocks.some((b: { type: string }) => b.type === "features")).toBe(
        true,
      );
      expect(blocks.find((b: { type: string }) => b.type === "image").src).toBe(
        "/sample-landscape.svg",
      );
      const contact = blocks.find(
        (b: { type: string }) => b.type === "contact",
      );
      expect(contact).toMatchObject({ email: "", phone: "", address: "" });
      assertGroundedContent(blocks, input);
      return {
        text,
        shape: blocks.map((b: { type: string }) => b.type).join(","),
        layout: blocks.find((b: { type: string }) => b.type === "features")
          .layout,
      };
    }),
  );
  expect(new Set(outputs.map((x) => x.text)).size).toBe(5);
  expect(new Set(outputs.map((x) => x.shape)).size).toBeGreaterThanOrEqual(3);
  expect(new Set(outputs.map((x) => x.layout))).toEqual(
    new Set(["grid", "list"]),
  );
});
test("mock aborts before generation and never echoes arbitrary prompt instructions", async () => {
  const provider = createMockProvider();
  const controller = new AbortController();
  controller.abort();
  await expect(
    provider.generate(
      { name: "Demo", prompt: "Private marker" },
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(
    (
      await provider.generate(
        { name: "Demo", prompt: "Private marker" },
        signal(),
      )
    ).text,
  ).not.toContain("Private marker");
});
