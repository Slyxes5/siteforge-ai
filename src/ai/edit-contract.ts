import { z } from "zod";
import { projectSchema } from "../project-schema/project";
import { structuredEditResponseSchema } from "./structured-edit";
import { OPENROUTER_EDIT_MODEL, liveEditSourceSchema } from "./edit-source";

/** HTTP limits are independent of website generation; no project identity crosses this boundary. */
export const EDIT_LIMITS = {
  instructionCharacters: 10_000,
  contextBytes: 131_072,
  requestBytes: 196_608,
  responseBytes: 131_072,
  timeoutMs: 45_000,
} as const;
export const editContextSchema = projectSchema
  .pick({ name: true, description: true, blocks: true })
  .refine((context) => context.blocks.every((block) => block.id.length <= 200))
  .refine(
    (context) =>
      new TextEncoder().encode(JSON.stringify(context)).byteLength <=
      EDIT_LIMITS.contextBytes,
  );
export const editRequestSchema = z.strictObject({
  instruction: z
    .string()
    .min(1)
    .max(EDIT_LIMITS.instructionCharacters)
    .refine((value) => Boolean(value.trim())),
  context: editContextSchema,
});
const sessionToken = z.string().regex(/^[a-f0-9]{64}$/);
export const editStatusSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("disabled"),
    provider: z.null(),
    sessionToken,
  }),
  z.strictObject({
    mode: z.literal("mock"),
    provider: z.literal("synthetic"),
    sessionToken,
  }),
  z.strictObject({
    mode: z.literal("live"),
    provider: z.literal("openrouter"),
    model: z.literal(OPENROUTER_EDIT_MODEL),
    sessionToken,
  }),
]);
/** Operations remain untrusted: the frontend must still bind and validate its full starting draft. */
export const editResultSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("mock"),
    response: structuredEditResponseSchema,
  }),
  z.strictObject({
    mode: z.literal("live"),
    source: liveEditSourceSchema,
    response: structuredEditResponseSchema,
  }),
]);
export type EditRequest = z.infer<typeof editRequestSchema>;
export type EditResult = z.infer<typeof editResultSchema>;
