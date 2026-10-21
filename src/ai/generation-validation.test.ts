import { expect, test } from "vitest";
import { z } from "zod";
import {
  GenerationValidationError,
  generationProblemSchema,
  parseGenerationBoundary,
} from "./generation-validation";

test("safe diagnostic errors never retain unknown keys, values, messages or causes", () => {
  const schema = z.strictObject({ "PRIVATE-FIELD": z.string() });
  try {
    parseGenerationBoundary(
      schema,
      { "PRIVATE-FIELD": 42, "PRIVATE-EXTRA": "PRIVATE-VALUE" },
      "structured_output",
      "STRUCTURED_CONTENT_REJECTED",
    );
    expect.fail("expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(GenerationValidationError);
    expect(error).toMatchObject({
      diagnostic: {
        issues: [
          { code: "invalid_type", path: "unknown" },
          { code: "unrecognized_keys", path: "$" },
        ],
      },
    });
    expect(JSON.stringify(error)).not.toMatch(
      /PRIVATE|42|cause|"message"|"keys"/,
    );
    expect((error as Error).message).toBe(
      "Generation content failed validation.",
    );
  }
});
test("issue details are bounded and contain only allowlisted codes and paths", () => {
  const result = z
    .object({ blocks: z.array(z.object({ text: z.string() })) })
    .safeParse({ blocks: Array.from({ length: 20 }, () => ({ text: 0 })) });
  expect(result.success).toBe(false);
  if (result.success) return;
  const diagnostic = new GenerationValidationError(
    "structured_output",
    "STRUCTURED_CONTENT_REJECTED",
    result.error,
  ).diagnostic;
  expect(diagnostic.issues).toHaveLength(8);
  expect(diagnostic.issues?.[0]).toEqual({
    code: "invalid_type",
    path: "blocks[0].text",
  });
  expect(generationProblemSchema.safeParse(diagnostic).success).toBe(true);
});
test("M2C business-fact failures use a safe allowlisted reason", () => {
  expect(
    generationProblemSchema.safeParse({
      stage: "content_semantics",
      reason: "UNSUPPORTED_BUSINESS_FACT",
    }).success,
  ).toBe(true);
});
test("diagnostic contract rejects arbitrary metadata and malicious field paths", () => {
  const valid = {
    stage: "structured_output",
    reason: "STRUCTURED_CONTENT_REJECTED",
  };
  expect(generationProblemSchema.safeParse(valid).success).toBe(true);
  for (const extra of [
    { stage: "PRIVATE" },
    { reason: "PRIVATE" },
    { raw: "PRIVATE" },
    { issues: [{ code: "PRIVATE", path: "blocks[0].text" }] },
    { issues: [{ code: "custom", path: "PRIVATE-FIELD" }] },
    { issues: [{ code: "custom", path: "blocks[0].text", value: "PRIVATE" }] },
  ])
    expect(
      generationProblemSchema.safeParse({ ...valid, ...extra }).success,
    ).toBe(false);
});
