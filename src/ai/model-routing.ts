import { z } from "zod";
const model = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,99}$/);
export const modelRoutingSchema = z
  .strictObject({
    selectedModel: model.nullable(),
    outboundRequests: z.number().int().min(0).max(2),
    attempts: z
      .array(
        z.strictObject({
          model,
          reason: z.enum([
            "primary",
            "http_429",
            "http_503",
            "pre_dispatch_timeout",
          ]),
          outcome: z.enum([
            "pending",
            "returned",
            "http_rejected",
            "ambiguous_error",
            "invalid_output",
            "timeout",
            "cancelled",
          ]),
          outbound: z.union([z.literal(0), z.literal(1)]),
          providerStatus: z.number().int().min(100).max(599).optional(),
        }),
      )
      .max(2),
  })
  .superRefine((value, ctx) => {
    if (
      value.outboundRequests !==
        value.attempts.reduce((sum, a) => sum + a.outbound, 0) ||
      new Set(value.attempts.map((a) => a.model)).size !==
        value.attempts.length ||
      (value.selectedModel !== null &&
        !value.attempts.some(
          (a) => a.model === value.selectedModel && a.outcome === "returned",
        ))
    )
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent model route metadata",
      });
  });
export type ModelRouting = z.infer<typeof modelRoutingSchema>;
