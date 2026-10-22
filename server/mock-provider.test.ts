import { expect, test } from "vitest";
import { createMockProvider } from "./mock-provider";
import { createMockPlanProvider } from "./mock-website-plan";
import {
  generatedContentSchema,
  validateGenerationCandidate,
} from "../src/ai/generation-content";
import { compileWebsitePlan } from "../src/ai/website-plan";
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
      expect(
        blocks.some((b: { type: string }) =>
          ["features", "menu"].includes(b.type),
        ),
      ).toBe(true);
      expect(blocks.find((b: { type: string }) => b.type === "image").src).toBe(
        "/sample-landscape.svg",
      );
      const contact = blocks.find(
        (b: { type: string }) => b.type === "contact",
      );
      expect(contact).toMatchObject({ email: "", phone: "", address: "" });
      assertGroundedContent(blocks, input);
      const features = blocks.find(
        (b: { type: string }) => b.type === "features",
      );
      return {
        text,
        shape: blocks.map((b: { type: string }) => b.type).join(","),
        layout: features?.layout,
      };
    }),
  );
  expect(new Set(outputs.map((x) => x.text)).size).toBe(5);
  expect(new Set(outputs.map((x) => x.shape)).size).toBeGreaterThanOrEqual(3);
  expect(new Set(outputs.map((x) => x.layout).filter(Boolean))).toEqual(
    new Set(["grid", "list"]),
  );
});

test("premium Manado cafe brief compiles to safe hospitality layout offline", async () => {
  const request = {
    name: "Kedai Kopi",
    prompt:
      "Website coffee shop premium di Manado, modern, elegant, minimalis, mobile-friendly.",
  };
  const provider = createMockPlanProvider();
  const output = await provider.generate(request, signal());
  const plan = JSON.parse(output.text);
  const candidate = compileWebsitePlan(
    output.text,
    request,
    provider,
    "manado-cafe-fixture",
  );

  expect(provider.id).toBe("mock");
  expect(plan.design).toBe("sage-editorial");
  expect(candidate.blocks.map((block) => block.type)).toEqual([
    "hero",
    "image",
    "menu",
    "gallery",
    "section",
    "contact",
  ]);
  expect(candidate.blocks.filter((block) => block.type === "menu")[0]).toMatchObject({
    items: [{ price: "" }, { price: "" }, { price: "" }],
  });
  expect(candidate.blocks.filter((block) => block.type === "contact")[0]).toMatchObject({
    email: "",
    phone: "",
    address: "",
    openingHours: "",
  });
  expect(
    candidate.blocks
      .filter((block) => block.type === "image" || block.type === "gallery")
      .every((block) =>
        block.type === "image"
          ? block.src === "/sample-landscape.svg"
          : block.items.every((item) => item.src === "/sample-landscape.svg"),
      ),
  ).toBe(true);
  expect(validateGenerationCandidate(candidate, request)).toEqual(candidate);
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
