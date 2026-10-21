import { z } from "zod";
import { designPresetIds } from "../project-schema/design";
import { projectSchema } from "../project-schema/project";
import type { Project } from "../project-schema/project";
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
  const blocks = plan.blocks.map((block, index) => {
    const common = { id: "b" + index, type: block.type, text: block.text };
    const anchor = block.target === "" ? "" : "#b" + block.target;
    switch (block.type) {
      case "heading":
      case "paragraph":
        return common;
      case "button":
        return { ...common, href: anchor };
      case "image":
        return { ...common, alt: block.body, src: "/sample-landscape.svg" };
      case "hero":
        return {
          ...common,
          subtitle: block.body,
          ctaText: block.action,
          ctaHref: anchor,
        };
      case "section":
        return { ...common, body: block.body, tone: block.style || "light" };
      case "features":
        return { ...common, layout: block.style || "grid", items: block.items };
      case "contact":
        return {
          ...common,
          body: block.body,
          email: block.email,
          phone: block.phone,
          address: block.address,
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
  style: z.enum(["", "light", "sage", "dark", "grid", "list"]),
  items: z
    .array(
      z.strictObject({
        title: z.string().min(1).max(80),
        description: z.string().max(240),
      }),
    )
    .max(6),
  email: z.string().max(320),
  phone: z.string().max(80),
  address: z.string().max(500),
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
  image: ["body"],
  hero: ["body", "action", "target"],
  section: ["body", "style"],
  features: ["style", "items"],
  contact: ["body", "email", "phone", "address"],
} satisfies Record<z.infer<typeof planBlockSchema>["type"], string[]>;

export const websitePlanSchema = planShapeSchema.superRefine((plan, ctx) => {
  const reject = (index: number, field: string) =>
    ctx.addIssue({
      code: "custom",
      path: ["blocks", index, field],
      message: "Invalid plan field",
    });
  plan.blocks.forEach((block, index) => {
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
    ] as const) {
      if (!allowed.includes(field) && block[field].length !== 0)
        reject(index, field);
    }
    if (block.type !== "image" && !block.text.trim()) reject(index, "text");
    if (
      block.type === "section" &&
      !["", "light", "sage", "dark"].includes(block.style)
    )
      reject(index, "style");
    if (block.type === "features") {
      if (!["", "grid", "list"].includes(block.style)) reject(index, "style");
      if (!block.items.length || block.items.some((item) => !item.title.trim()))
        reject(index, "items");
    }
    if (block.target !== "") {
      const target = /^(?:0|[1-9][0-9]*)$/.test(block.target)
        ? Number(block.target)
        : -1;
      if (
        !Number.isSafeInteger(target) ||
        !["section", "features", "contact"].includes(
          plan.blocks[target]?.type ?? "",
        )
      )
        reject(index, "target");
    }
  });
});
