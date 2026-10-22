import { generatedContentSchema } from "../src/ai/generation-content";
import type { WebsiteGenerationProvider } from "../src/ai/website-generation";
import { createMockProvider } from "./mock-provider";

/** Synthetic fixtures only. Not an AI parser or a runtime fallback for model output. */
export function planFromMockContent(value: unknown) {
  const { blocks } = generatedContentSchema.parse(value);
  return {
    blocks: blocks.map((block) => {
      const target =
        block.type === "hero"
          ? block.ctaHref
          : block.type === "button"
            ? block.href
            : "";
      const targetIndex = target
        ? blocks.findIndex((b) => b.id === target.slice(1))
        : -1;
      if (target && targetIndex < 0)
        throw new Error("Invalid synthetic anchor");
      return {
        type:
          block.type === "menu"
            ? "features"
            : block.type === "gallery"
              ? "image"
              : block.type,
        text: block.text,
        body:
          block.type === "hero"
            ? block.subtitle
            : block.type === "image"
              ? block.alt
              : block.type === "section" || block.type === "contact"
                ? block.body
                : "",
        action: block.type === "hero" ? block.ctaText : "",
        target: target ? String(targetIndex) : "",
        style:
          block.type === "menu"
            ? "menu"
            : block.type === "gallery"
              ? "gallery"
              : block.type === "section"
            ? block.tone
            : block.type === "features"
              ? block.layout
              : "",
        items:
          block.type === "features" || block.type === "menu"
            ? block.items.map((item) => ({
                title: item.title,
                description: item.description,
                ...(block.type === "menu" && "price" in item && item.price
                  ? { price: item.price }
                  : {}),
              }))
            : block.type === "gallery"
              ? block.items.map((item) => ({
                  title: item.caption,
                  description: item.alt,
                }))
              : [],
        email: block.type === "contact" ? block.email : "",
        phone: block.type === "contact" ? block.phone : "",
        address: block.type === "contact" ? block.address : "",
        openingHours:
          block.type === "contact" ? block.openingHours : "",
      };
    }),
  };
}
export function createMockPlanProvider(): WebsiteGenerationProvider {
  const legacy = createMockProvider();
  return {
    ...legacy,
    outputFormat: "website-plan-v1",
    async generate(request, signal, context) {
      const output = await legacy.generate(request, signal, context);
      return {
        text: JSON.stringify({
          ...planFromMockContent(JSON.parse(output.text)),
          design: /\b(coffee|coffe|kopi|cafe|kafe)\b/i.test(request.prompt)
            ? "sage-editorial"
            : "default",
        }),
      };
    },
  };
}
