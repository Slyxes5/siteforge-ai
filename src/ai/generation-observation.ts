import { z } from "zod";
import { generationProblemSchema } from "./generation-validation";
import { modelRoutingSchema } from "./model-routing";
import {
  providerHttpCategorySchema,
  providerHttpDiagnosticsSchema,
  providerRpcStatusSchema,
} from "./provider-http";

export const generationOutcomeSchema = z.enum([
  "success",
  "provider_error",
  "validation_error",
  "timeout",
  "cancelled",
]);
export type GenerationOutcome = z.infer<typeof generationOutcomeSchema>;
/** Allowlisted metadata only; transport calls do not establish provider acceptance or billing. */
export const generationDiagnosticsSchema = z
  .strictObject({
    requestId: z.uuid(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    durationMs: z.number().int().nonnegative(),
    outcome: generationOutcomeSchema,
    schemaValidation: z.enum(["not_attempted", "valid", "invalid"]),
    providerAttempts: z.number().int().min(0).max(2),
    transportCalls: z.number().int().min(0).max(2),
    httpStatus: z.number().int().min(100).max(599),
    providerStatus: z.number().int().min(100).max(599).optional(),
    providerErrorCategory: providerHttpCategorySchema.optional(),
    providerRetryable: z.boolean().optional(),
    providerRpcStatus: providerRpcStatusSchema.optional(),
    problem: generationProblemSchema.optional(),
    provider: z.enum(["gemini", "openrouter", "mock"]).optional(),
    model: z.string().min(1).max(100).optional(),
    routing: modelRoutingSchema.optional(),
  })
  .superRefine((value, ctx) => {
    // Legacy receipts with status alone remain readable; new metadata must be atomic/consistent.
    if (
      value.providerErrorCategory === undefined &&
      value.providerRetryable === undefined &&
      value.providerRpcStatus === undefined
    )
      return;
    if (
      !providerHttpDiagnosticsSchema.safeParse({
        providerStatus: value.providerStatus,
        providerErrorCategory: value.providerErrorCategory,
        providerRetryable: value.providerRetryable,
        providerRpcStatus: value.providerRpcStatus,
      }).success
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid provider HTTP diagnostics",
      });
  });
export type GenerationDiagnostics = z.infer<typeof generationDiagnosticsSchema>;
