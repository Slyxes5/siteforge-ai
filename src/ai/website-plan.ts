import { z } from "zod";
import { designPresetIds } from "../project-schema/design";
import { projectSchema } from "../project-schema/project";
import type { Project } from "../project-schema/project";
import { coffeeArt, menuIllustration } from "../project-schema/visual-assets";
import {
  GENERATION_LIMITS,
  websiteGenerationRequestSchema,
  type WebsiteGenerationRequest,
  type WebsiteGenerationProvider,
} from "./website-generation";
import { buildCandidate } from "./generation-content";
import {
  GenerationValidationError,
  parseGenerationBoundary,
} from "./generation-validation";

export function compileWebsitePlan(
  raw: string,
  request: WebsiteGenerationRequest,
  provider: Pick<WebsiteGenerationProvider, "id" | "model">,
  projectId: string,
): Project {
  if (new Blob([raw]).size > GENERATION_LIMITS.responseBytes)
    throw new GenerationValidationError("content_json", "RESPONSE_TOO_LARGE");
  if (!raw.trim())
    throw new GenerationValidationError("content_json", "EMPTY_CONTENT");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new GenerationValidationError(
      "content_json",
      "MALFORMED_CONTENT_JSON",
    );
  }
  const plan = parseGenerationBoundary(
    websitePlanSchema,
    value,
    "structured_output",
    "STRUCTURED_CONTENT_REJECTED",
  );
  const coffeeGraphics = plan.blocks.some(
    (block) => block.type === "hero" && block.style === "coffee-editorial",
  );
  const blocks = plan.blocks.map((block, index) => {
    const type =
      block.type === "image" && ["gallery", "carousel"].includes(block.style)
        ? "gallery"
        : block.type === "features" &&
            ["menu", "menu-cards"].includes(block.style)
          ? "menu"
          : block.type;
    const common = { id: "b" + index, type, text: block.text };
    const anchor = block.target === "" ? "" : "#b" + block.target;
    switch (block.type) {
      case "heading":
      case "paragraph":
        return common;
      case "button":
        return { ...common, href: anchor };
      case "image":
        if (type === "gallery")
          return {
            ...common,
            ...(block.style === "carousel" ? { layout: "carousel" } : {}),
            items: block.items.map((item, itemIndex) => ({
              src:
                block.style === "carousel" && coffeeGraphics
                  ? coffeeArt.gallery[itemIndex % coffeeArt.gallery.length]
                  : "/sample-landscape.svg",
              alt: item.description,
              caption: item.title,
            })),
          };
        return { ...common, alt: block.body, src: "/sample-landscape.svg" };
      case "hero":
        return {
          ...common,
          subtitle: block.body,
          ctaText: block.action,
          ctaHref: anchor,
          ...(block.style === "coffee-editorial"
            ? {
                visual: "coffee-editorial",
                imageSrc: coffeeArt.hero,
                imageAlt:
                  "Ilustrasi kopi editorial; ganti dengan foto pilihan Anda.",
              }
            : {}),
        };
      case "section":
        return { ...common, body: block.body, tone: block.style || "light" };
      case "features":
        if (type === "menu")
          return {
            ...common,
            items: block.items.map((item) => ({
              ...item,
              price: item.price ?? "",
              ...(block.style === "menu-cards"
                ? {
                    imageSrc: coffeeGraphics
                      ? menuIllustration(item.title)
                      : "/sample-landscape.svg",
                    imageAlt: "Ilustrasi menu; ganti dengan foto " + item.title,
                  }
                : {}),
            })),
          };
        return {
          ...common,
          layout: block.style || "grid",
          items: block.items.map(({ title, description }) => ({
            title,
            description,
          })),
        };
      case "contact":
        return {
          ...common,
          body: block.body,
          email: block.email,
          phone: block.phone,
          address: block.address,
          openingHours: block.openingHours ?? "",
        };
    }
  });
  const input = parseGenerationBoundary(
    websiteGenerationRequestSchema,
    request,
    "provider_request",
    "INVALID_PROVIDER_REQUEST",
  );
  const candidate = buildCandidate(
    JSON.stringify({ blocks }),
    input,
    provider,
    projectId,
  );
  const preset =
    input.designPreference ??
    (plan.design === "default" ? undefined : plan.design);
  return projectSchema.parse({
    ...candidate,
    ...(preset ? { design: { preset } } : {}),
  });
}

const planBlockSchema = z.strictObject({
  type: z.enum([
    "heading",
    "paragraph",
    "button",
    "image",
    "hero",
    "section",
    "features",
    "contact",
  ]),
  text: z.string().max(2000),
  body: z.string().max(2000),
  action: z.string().max(2000),
  target: z.string().max(42),
  style: z.enum([
    "",
    "light",
    "sage",
    "dark",
    "grid",
    "list",
    "menu",
    "gallery",
    "carousel",
    "menu-cards",
    "coffee-editorial",
  ]),
  items: z
    .array(
      z.strictObject({
        title: z.string().min(1).max(80),
        description: z.string().max(240),
        price: z.string().max(80).default(""),
      }),
    )
    .max(6),
  email: z.string().max(320),
  phone: z.string().max(80),
  address: z.string().max(500),
  openingHours: z.string().max(500).default(""),
});

const planShapeSchema = z.strictObject({
  blocks: z.array(planBlockSchema).min(1).max(12),
  // Legacy plans remain readable; new provider requests explicitly include design.
  design: z.enum(["default", ...designPresetIds]).optional(),
});

const { $schema: _meta, ...providerSchema } = z.toJSONSchema(
  planShapeSchema.extend({ design: z.enum(["default", ...designPresetIds]) }),
  {
    override: ({ jsonSchema }) => {
      delete jsonSchema.minLength;
      delete jsonSchema.maxLength;
      delete jsonSchema.description;
      delete jsonSchema.default;
      if (jsonSchema.type === "array" && jsonSchema.minItems === undefined)
        jsonSchema.minItems = 0;
    },
  },
);
/** Provider projection describes shape only; local validation enforces block semantics. */
export const websitePlanJsonSchema = providerSchema;

const allowedFields = {
  heading: [],
  paragraph: [],
  button: ["target"],
  image: ["body", "style", "items"],
  hero: ["body", "action", "target", "style"],
  section: ["body", "style"],
  features: ["style", "items"],
  contact: ["body", "email", "phone", "address", "openingHours"],
} satisfies Record<z.infer<typeof planBlockSchema>["type"], string[]>;

export const websitePlanSchema = planShapeSchema.superRefine((plan, ctx) => {
  const reject = (index: number, field: string) =>
    ctx.addIssue({
      code: "custom",
      path: ["blocks", index, field],
      message: "Invalid plan field",
    });
  plan.blocks.forEach((block, index) => {
    if (
      block.type === "hero" &&
      !["", "coffee-editorial"].includes(block.style)
    )
      reject(index, "style");
    const allowed: readonly string[] = allowedFields[block.type];
    for (const field of [
      "body",
      "action",
      "target",
      "style",
      "items",
      "email",
      "phone",
      "address",
      "openingHours",
    ] as const) {
      if (
        !allowed.includes(field) &&
        block[field] !== undefined &&
        block[field].length !== 0
      )
        reject(index, field);
    }
    if (block.type !== "image" && !block.text.trim()) reject(index, "text");
    if (
      block.type === "section" &&
      !["", "light", "sage", "dark"].includes(block.style)
    )
      reject(index, "style");
    if (
      block.type === "image" &&
      !["", "gallery", "carousel"].includes(block.style)
    )
      reject(index, "style");
    if (
      block.type === "image" &&
      !["gallery", "carousel"].includes(block.style) &&
      block.items.length > 0
    )
      reject(index, "items");
    if (
      block.type === "image" &&
      ["gallery", "carousel"].includes(block.style) &&
      (!block.text.trim() ||
        !block.items.length ||
        block.items.some((item) => !item.title.trim()))
    )
      reject(index, "items");
    if (block.type === "features") {
      if (!["", "grid", "list", "menu", "menu-cards"].includes(block.style))
        reject(index, "style");
      if (!block.items.length || block.items.some((item) => !item.title.trim()))
        reject(index, "items");
    }
    if (block.target !== "") {
      const target = /^(?:0|[1-9][0-9]*)$/.test(block.target)
        ? Number(block.target)
        : -1;
      const targetBlock = Number.isSafeInteger(target)
        ? plan.blocks[target]
        : undefined;
      const targetIsSection =
        targetBlock !== undefined &&
        (["section", "features", "contact"].includes(targetBlock.type) ||
          (targetBlock.type === "features" && targetBlock.style === "menu") ||
          (targetBlock.type === "image" &&
            ["gallery", "carousel"].includes(targetBlock.style)));
      if (!targetIsSection) reject(index, "target");
    }
  });
});
