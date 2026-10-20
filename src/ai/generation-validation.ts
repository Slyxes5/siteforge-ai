import { z } from "zod";

const fields = [
  "blocks",
  "id",
  "type",
  "text",
  "href",
  "src",
  "alt",
  "subtitle",
  "ctaText",
  "ctaHref",
  "body",
  "tone",
  "layout",
  "items",
  "title",
  "email",
  "phone",
  "address",
  "schemaVersion",
  "name",
  "description",
  "revision",
  "generation",
  "kind",
  "provider",
  "model",
  "promptVersion",
  "mode",
  "candidates",
  "finishReason",
  "content",
  "parts",
  "thought",
  "thoughtSignature",
  "safetyRatings",
  "blocked",
  "promptFeedback",
  "blockReason",
  "unknown",
] as const;
const fieldToken = `(?:${fields.join("|")})(?:\\[(?:[0-9]{1,3}|\\*)\\])?`;
export const diagnosticPathSchema = z
  .string()
  .max(180)
  .regex(new RegExp(`^(?:\\$|${fieldToken}(?:\\.${fieldToken})*)$`));
export const generationProblemSchema = z.strictObject({
  stage: z.enum([
    "provider_request",
    "provider_transport",
    "provider_envelope",
    "content_json",
    "structured_output",
    "content_semantics",
    "canonical_project",
    "candidate_policy",
  ]),
  reason: z.enum([
    "INVALID_PROVIDER_REQUEST",
    "UNSUPPORTED_REQUEST_SCHEMA",
    "PROVIDER_REQUEST_TOO_LARGE",
    "NETWORK_ERROR",
    "HTTP_ERROR",
    "PROVIDER_REFUSAL",
    "OUTPUT_TRUNCATED",
    "PROVIDER_FINISH_REASON",
    "EMPTY_RESPONSE",
    "RESPONSE_TOO_LARGE",
    "MALFORMED_ENVELOPE_JSON",
    "INVALID_PROVIDER_ENVELOPE",
    "UNSUPPORTED_PROVIDER_PART",
    "EMPTY_CONTENT",
    "MALFORMED_CONTENT_JSON",
    "STRUCTURED_CONTENT_REJECTED",
    "DUPLICATE_BLOCK_ID",
    "UNKNOWN_SECTION_ANCHOR",
    "CANONICAL_PROJECT_REJECTED",
    "CANDIDATE_POLICY_REJECTED",
    "UNSUPPORTED_BUSINESS_FACT",
  ]),
  issues: z
    .array(
      z.strictObject({
        code: z.enum([
          "invalid_type",
          "invalid_value",
          "too_small",
          "too_big",
          "invalid_format",
          "unrecognized_keys",
          "invalid_union",
          "custom",
        ]),
        path: diagnosticPathSchema,
      }),
    )
    .max(8)
    .optional(),
});
export type GenerationProblem = z.infer<typeof generationProblemSchema>;
/** Never copy Zod messages, keys, values, input, provider text or a raw cause. */
export class GenerationValidationError extends Error {
  readonly diagnostic: GenerationProblem;
  constructor(
    stage: GenerationProblem["stage"],
    reason: GenerationProblem["reason"],
    error?: z.ZodError,
  ) {
    super("Generation content failed validation.");
    const issues = error?.issues.slice(0, 8).map((issue) => ({
      code: issue.code,
      path:
        issue.path.reduce<string>((path, part) => {
          if (typeof part === "number")
            return (
              path +
              `[${Number.isInteger(part) && part >= 0 && part <= 199 ? part : "*"}]`
            );
          const field = fields.includes(part as (typeof fields)[number])
            ? String(part)
            : "unknown";
          return path ? path + "." + field : field;
        }, "") || "$",
    }));
    this.diagnostic = generationProblemSchema.parse({
      stage,
      reason,
      ...(issues ? { issues } : {}),
    });
  }
}
export function parseGenerationBoundary<T>(
  schema: z.ZodType<T>,
  value: unknown,
  stage: GenerationProblem["stage"],
  reason: GenerationProblem["reason"],
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new GenerationValidationError(stage, reason, parsed.error);
  return parsed.data;
}
