import { z } from "zod";
import { assertGroundedContent } from "./generation-grounding";
import {
  GenerationValidationError,
  parseGenerationBoundary,
} from "./generation-validation";
import { projectSchema, type Project } from "../project-schema/project";
import {
  GENERATION_LIMITS,
  GENERATION_PROMPT_VERSION,
  websiteGenerationRequestSchema,
  type WebsiteGenerationRequest,
  type WebsiteGenerationProvider,
} from "./website-generation";
const id = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,39}$/)
  .describe(
    "Unique symbolic lowercase block ID: starts with a-z, then lowercase letters, digits or hyphens; at most 40 characters.",
  );
const text = z
  .string()
  .min(1)
  .max(GENERATION_LIMITS.textCharacters)
  .describe("Plain text, 1 to 2000 Unicode characters; no HTML or scripts.");
const optional = z
  .string()
  .max(GENERATION_LIMITS.textCharacters)
  .describe(
    "Plain text, 0 to 2000 Unicode characters. Required field; use an empty string if unused.",
  );
const anchor = z
  .string()
  .max(42)
  .regex(/^(?:|#[a-z][a-z0-9-]{0,39})$/)
  .describe(
    "Empty string or # followed by the symbolic ID of a section in this output. No external URLs.",
  );
const generatedBlockSchema = z.discriminatedUnion("type", [
  z.strictObject({ id, type: z.literal("heading"), text }),
  z.strictObject({ id, type: z.literal("paragraph"), text }),
  z.strictObject({ id, type: z.literal("button"), text, href: anchor }),
  z.strictObject({
    id,
    type: z.literal("image"),
    text: optional,
    alt: optional,
    src: z.literal("/sample-landscape.svg"),
  }),
  z.strictObject({
    id,
    type: z.literal("hero"),
    text,
    subtitle: optional,
    ctaText: optional,
    ctaHref: anchor,
  }),
  z.strictObject({
    id,
    type: z.literal("section"),
    text,
    body: optional,
    tone: z.enum(["light", "sage", "dark"]),
  }),
  z.strictObject({
    id,
    type: z.literal("features"),
    text,
    layout: z.enum(["grid", "list"]),
    items: z
      .array(
        z.strictObject({
          title: z
            .string()
            .min(1)
            .max(80)
            .describe("Short item title, 1 to 80 Unicode characters."),
          description: z
            .string()
            .max(240)
            .describe(
              "Concise item description, at most 240 Unicode characters; use placeholders when facts are missing.",
            ),
        }),
      )
      .min(1)
      .max(6),
  }),
  z.strictObject({
    id,
    type: z.literal("contact"),
    text,
    body: optional,
    email: z
      .string()
      .max(320)
      .describe(
        "Copy the supplied email exactly, or empty string if not supplied.",
      ),
    phone: z
      .string()
      .max(80)
      .describe(
        "Copy the supplied phone exactly, or empty string if not supplied.",
      ),
    address: z
      .string()
      .max(500)
      .describe(
        "Copy the supplied address exactly, or empty string if not supplied.",
      ),
  }),
]);
export const generatedContentSchema = z.strictObject({
  blocks: z.array(generatedBlockSchema).min(1).max(GENERATION_LIMITS.blocks),
});
// Provider JSON Schema contains no custom refinements; semantics remain enforced below.
const { $schema: _meta, ...jsonSchema } = z.toJSONSchema(
  generatedContentSchema,
  {
    override: ({ jsonSchema }) => {
      // Use the documented responseJsonSchema subset; never relax the local Zod validator.
      if (jsonSchema.const !== undefined) {
        jsonSchema.enum = [jsonSchema.const];
        delete jsonSchema.const;
      }
      delete jsonSchema.pattern;
      delete jsonSchema.minLength;
      delete jsonSchema.maxLength;
      // Disjoint `type` enums make anyOf equivalent.
      if (jsonSchema.oneOf) {
        jsonSchema.anyOf = jsonSchema.oneOf;
        delete jsonSchema.oneOf;
      }
    },
  },
);
export const generatedContentJsonSchema = jsonSchema;
/** Recheck the restricted generation policy before any candidate reaches browser rendering. */
export function validateGenerationCandidate(
  value: unknown,
  input?: WebsiteGenerationRequest,
): Project {
  const project = projectSchema.parse(value);
  if (
    project.revision !== 0 ||
    project.generation?.kind !== "ai" ||
    project.blocks.length < 1 ||
    project.blocks.length > GENERATION_LIMITS.blocks
  )
    throw new Error("Invalid generation candidate");
  const sections = new Set(
    project.blocks
      .filter((block) =>
        ["section", "features", "contact"].includes(block.type),
      )
      .map((block) => block.id),
  );
  project.blocks.forEach((block, index) => {
    if (block.id !== project.id + "-b" + index)
      throw new Error("Invalid candidate block identity");
    if (
      Object.entries(block).some(
        ([key, value]) =>
          key !== "id" &&
          typeof value === "string" &&
          Array.from(value).length > GENERATION_LIMITS.textCharacters,
      )
    )
      throw new Error("Candidate text too long");
    if (block.type === "image" && block.src !== "/sample-landscape.svg")
      throw new Error("External candidate images are not allowed");
    const url =
      block.type === "button"
        ? block.href
        : block.type === "hero"
          ? block.ctaHref
          : "";
    if (url !== "" && (!url.startsWith("#") || !sections.has(url.slice(1))))
      throw new Error("Invalid candidate anchor");
  });
  // Reuse restricted validation for nested values; owned IDs/anchors are checked separately.
  generatedContentSchema.parse({
    blocks: project.blocks.map((block, index) => ({
      ...block,
      id: "b" + index,
      ...(block.type === "button"
        ? { href: "" }
        : block.type === "hero"
          ? { ctaHref: "" }
          : {}),
    })),
  });
  assertGroundedContent(
    project.blocks,
    input ?? { name: project.name, prompt: project.description ?? "" },
  );
  return project;
}
export function buildCandidate(
  raw: string,
  input: WebsiteGenerationRequest,
  provider: Pick<WebsiteGenerationProvider, "id" | "model">,
  projectId: string,
): Project {
  const request = websiteGenerationRequestSchema.parse(input);
  if (new Blob([raw]).size > GENERATION_LIMITS.responseBytes)
    throw new GenerationValidationError("content_json", "RESPONSE_TOO_LARGE");
  let value: unknown;
  if (!raw.trim())
    throw new GenerationValidationError("content_json", "EMPTY_CONTENT");
  try {
    value = JSON.parse(raw);
  } catch {
    throw new GenerationValidationError(
      "content_json",
      "MALFORMED_CONTENT_JSON",
    );
  }
  const content = parseGenerationBoundary(
    generatedContentSchema,
    value,
    "structured_output",
    "STRUCTURED_CONTENT_REJECTED",
  );
  if (
    new Set(content.blocks.map((block) => block.id)).size !==
    content.blocks.length
  )
    throw new GenerationValidationError(
      "content_semantics",
      "DUPLICATE_BLOCK_ID",
    );
  assertGroundedContent(content.blocks, request);
  const ids = new Map(
    content.blocks.map((block, index) => [block.id, projectId + "-b" + index]),
  );
  const sections = new Set(
    content.blocks
      .filter((block) =>
        ["section", "features", "contact"].includes(block.type),
      )
      .map((block) => block.id),
  );
  const resolve = (url: string) => {
    if (url === "") return "";
    const key = url.slice(1);
    if (!sections.has(key))
      throw new GenerationValidationError(
        "content_semantics",
        "UNKNOWN_SECTION_ANCHOR",
      );
    return "#" + ids.get(key)!;
  };
  const blocks = content.blocks.map((block) => {
    const owned = { ...block, id: ids.get(block.id)! };
    if (owned.type === "button") return { ...owned, href: resolve(owned.href) };
    if (owned.type === "hero")
      return { ...owned, ctaHref: resolve(owned.ctaHref) };
    return owned;
  });
  return parseGenerationBoundary(
    projectSchema,
    {
      schemaVersion: 1,
      id: projectId,
      name: request.name,
      description: request.prompt,
      revision: 0,
      generation: {
        kind: "ai",
        provider: provider.id,
        model: provider.model,
        promptVersion: GENERATION_PROMPT_VERSION,
        mode: provider.id === "mock" ? "mock" : "live",
      },
      blocks,
    },
    "canonical_project",
    "CANONICAL_PROJECT_REJECTED",
  );
}
