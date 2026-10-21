import { z } from "zod";

export const providerRpcStatusSchema = z.enum([
  "INVALID_ARGUMENT",
  "FAILED_PRECONDITION",
  "OUT_OF_RANGE",
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "ALREADY_EXISTS",
  "RESOURCE_EXHAUSTED",
  "ABORTED",
  "CANCELLED",
  "DEADLINE_EXCEEDED",
  "UNAVAILABLE",
  "INTERNAL",
  "UNKNOWN",
  "DATA_LOSS",
  "UNIMPLEMENTED",
]);
export type ProviderRpcStatus = z.infer<typeof providerRpcStatusSchema>;

export const providerHttpCategorySchema = z.enum([
  "invalid_request",
  "authorization",
  "model_unavailable",
  "rate_limit_or_quota",
  "provider_failure",
  "other_http",
]);
const providerHttpShape = z.strictObject({
  providerStatus: z.number().int().min(100).max(599),
  providerErrorCategory: providerHttpCategorySchema,
  providerRetryable: z.boolean(),
  providerRpcStatus: providerRpcStatusSchema.optional(),
});
export type ProviderHttpDiagnostics = z.infer<typeof providerHttpShape>;

/** Status-only classification. Never inspect provider bodies or sensitive headers.
 * Retryable means potentially transient under the existing policy, NOT permission to retry.
 * 404 and 429 cannot establish an exact model-access or quota cause without further evidence.
 */
export function classifyProviderHttp(
  status: number | undefined,
): ProviderHttpDiagnostics | undefined {
  if (
    status === undefined ||
    !Number.isInteger(status) ||
    status < 100 ||
    status > 599
  )
    return undefined;
  const providerErrorCategory: ProviderHttpDiagnostics["providerErrorCategory"] =
    status === 400
      ? "invalid_request"
      : status === 401 || status === 403
        ? "authorization"
        : status === 404
          ? "model_unavailable"
          : status === 429
            ? "rate_limit_or_quota"
            : status >= 500
              ? "provider_failure"
              : "other_http";
  return {
    providerStatus: status,
    providerErrorCategory,
    providerRetryable: status === 429 || status >= 500,
  };
}
export const providerHttpDiagnosticsSchema = providerHttpShape.refine(
  (value) => {
    const expected = classifyProviderHttp(value.providerStatus);
    return (
      expected?.providerErrorCategory === value.providerErrorCategory &&
      expected.providerRetryable === value.providerRetryable
    );
  },
  "Inconsistent provider HTTP diagnostics",
);
