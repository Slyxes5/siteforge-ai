import { z } from "zod";
import { ProviderError } from "./provider-error";
import { GENERATION_SYSTEM_PROMPT_V2 } from "./generation-prompt";
import { generatedContentJsonSchema } from "../src/ai/generation-content";
import {
  GENERATION_LIMITS,
  websiteGenerationRequestSchema,
  type WebsiteGenerationRequest,
} from "../src/ai/website-generation";

/** SiteForge resource guards, NOT advertised Gemini API complexity/size limits. */
export const GEMINI_REQUEST_GUARDS = Object.freeze({
  bodyBytes: 65536,
  schemaBytes: 32768,
  schemaNodes: 256,
  schemaDepth: 16,
});
function fail(
  reason:
    | "INVALID_PROVIDER_REQUEST"
    | "UNSUPPORTED_REQUEST_SCHEMA"
    | "PROVIDER_REQUEST_TOO_LARGE",
): never {
  throw new ProviderError("REQUEST_CONTRACT", undefined, undefined, {
    stage: "provider_request",
    reason,
  });
}
const part = z.strictObject({ text: z.string() });
const payloadSchema = z.strictObject({
  systemInstruction: z.strictObject({
    parts: z.tuple([
      z.strictObject({ text: z.literal(GENERATION_SYSTEM_PROMPT_V2) }),
    ]),
  }),
  contents: z.tuple([
    z.strictObject({ role: z.literal("user"), parts: z.tuple([part]) }),
  ]),
  generationConfig: z.strictObject({
    responseMimeType: z.literal("application/json"),
    responseJsonSchema: z.unknown(),
    maxOutputTokens: z.literal(GENERATION_LIMITS.outputTokens),
  }),
});
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const own = (object: Record<string, unknown>, key: string) =>
  Object.hasOwn(object, key);

/** Deliberately validate only the emitted SiteForge subset, not all Google-supported schema features. */
function validateSchema(schema: unknown): void {
  if (!record(schema) || schema.type !== "object")
    fail("UNSUPPORTED_REQUEST_SCHEMA");
  const properties = schema.properties;
  const blocks = record(properties) ? properties.blocks : undefined;
  const items = record(blocks) ? blocks.items : undefined;
  const variants = record(items) ? items.anyOf : undefined;
  const expectedTypes = new Set([
    "heading",
    "paragraph",
    "button",
    "image",
    "hero",
    "section",
    "features",
    "contact",
  ]);
  if (
    !record(properties) ||
    Object.keys(properties).length !== 1 ||
    !record(blocks) ||
    blocks.type !== "array" ||
    blocks.minItems !== 1 ||
    blocks.maxItems !== GENERATION_LIMITS.blocks ||
    !Array.isArray(variants) ||
    variants.length !== expectedTypes.size
  )
    fail("UNSUPPORTED_REQUEST_SCHEMA");
  for (const variant of variants) {
    const fields = record(variant) ? variant.properties : undefined;
    const type = record(fields) ? fields.type : undefined;
    const values = record(type) ? type.enum : undefined;
    if (
      !Array.isArray(values) ||
      values.length !== 1 ||
      typeof values[0] !== "string" ||
      !expectedTypes.delete(values[0])
    )
      fail("UNSUPPORTED_REQUEST_SCHEMA");
  }
  if (expectedTypes.size) fail("UNSUPPORTED_REQUEST_SCHEMA");
  if (
    Buffer.byteLength(JSON.stringify(schema), "utf8") >
    GEMINI_REQUEST_GUARDS.schemaBytes
  )
    fail("PROVIDER_REQUEST_TOO_LARGE");
  const queue = [{ value: schema as unknown, depth: 1 }];
  let nodes = 0;
  while (queue.length) {
    const { value, depth } = queue.pop()!;
    if (
      ++nodes > GEMINI_REQUEST_GUARDS.schemaNodes ||
      depth > GEMINI_REQUEST_GUARDS.schemaDepth
    )
      fail("UNSUPPORTED_REQUEST_SCHEMA");
    if (!record(value)) fail("UNSUPPORTED_REQUEST_SCHEMA");
    const descriptionValid =
      !own(value, "description") ||
      (typeof value.description === "string" &&
        value.description.length <= 2000);
    if (!descriptionValid) fail("UNSUPPORTED_REQUEST_SCHEMA");
    let allowed: readonly string[];
    const children: unknown[] = [];
    if (own(value, "anyOf")) {
      allowed = ["anyOf", "description"];
      if (
        !Array.isArray(value.anyOf) ||
        value.anyOf.length < 1 ||
        value.anyOf.length > 8
      )
        fail("UNSUPPORTED_REQUEST_SCHEMA");
      children.push(...value.anyOf);
    } else if (value.type === "object") {
      allowed = [
        "type",
        "properties",
        "required",
        "additionalProperties",
        "description",
      ];
      if (
        !record(value.properties) ||
        !Array.isArray(value.required) ||
        value.additionalProperties !== false
      )
        fail("UNSUPPORTED_REQUEST_SCHEMA");
      const keys = Object.keys(value.properties);
      if (
        !keys.length ||
        keys.length > 64 ||
        value.required.length !== keys.length ||
        new Set(value.required).size !== keys.length ||
        !value.required.every(
          (key) =>
            typeof key === "string" &&
            own(value.properties as Record<string, unknown>, key),
        )
      )
        fail("UNSUPPORTED_REQUEST_SCHEMA");
      children.push(...Object.values(value.properties));
    } else if (value.type === "array") {
      allowed = ["type", "items", "minItems", "maxItems", "description"];
      const min = value.minItems,
        max = value.maxItems;
      if (
        typeof min !== "number" ||
        typeof max !== "number" ||
        !Number.isInteger(min) ||
        !Number.isInteger(max) ||
        min < 0 ||
        max < min ||
        max > GENERATION_LIMITS.blocks
      )
        fail("UNSUPPORTED_REQUEST_SCHEMA");
      children.push(value.items);
    } else if (value.type === "string") {
      allowed = ["type", "enum", "description"];
      if (
        own(value, "enum") &&
        (!Array.isArray(value.enum) ||
          value.enum.length < 1 ||
          value.enum.length > 64 ||
          !value.enum.every((item) => typeof item === "string") ||
          new Set(value.enum).size !== value.enum.length)
      )
        fail("UNSUPPORTED_REQUEST_SCHEMA");
    } else fail("UNSUPPORTED_REQUEST_SCHEMA");
    if (Object.keys(value).some((key) => !allowed.includes(key)))
      fail("UNSUPPORTED_REQUEST_SCHEMA");
    for (const child of children)
      queue.push({ value: child, depth: depth + 1 });
  }
}

/** Validate before budget notification/fetch; never log payload, parser errors, keys or paths. */
export function validateGeminiRequestPayload(payload: unknown): string {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(payload);
  } catch {
    fail("INVALID_PROVIDER_REQUEST");
  }
  if (encoded === undefined) fail("INVALID_PROVIDER_REQUEST");
  if (Buffer.byteLength(encoded, "utf8") > GEMINI_REQUEST_GUARDS.bodyBytes)
    fail("PROVIDER_REQUEST_TOO_LARGE");
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) fail("INVALID_PROVIDER_REQUEST");
  let input: unknown;
  try {
    input = JSON.parse(parsed.data.contents[0].parts[0].text);
  } catch {
    fail("INVALID_PROVIDER_REQUEST");
  }
  if (!websiteGenerationRequestSchema.safeParse(input).success)
    fail("INVALID_PROVIDER_REQUEST");
  validateSchema(parsed.data.generationConfig.responseJsonSchema);
  return encoded;
}
export function buildGeminiRequestBody(
  request: WebsiteGenerationRequest,
): string {
  if (!websiteGenerationRequestSchema.safeParse(request).success)
    fail("INVALID_PROVIDER_REQUEST");
  return validateGeminiRequestPayload({
    systemInstruction: { parts: [{ text: GENERATION_SYSTEM_PROMPT_V2 }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(request) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: generatedContentJsonSchema,
      maxOutputTokens: GENERATION_LIMITS.outputTokens,
    },
  });
}
