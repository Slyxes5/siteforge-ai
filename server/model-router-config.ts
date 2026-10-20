import { z } from "zod";
import { GEMINI_MODEL_CATALOG } from "./gemini-model-catalog";
const model = z
  .string()
  .refine((id) => Object.hasOwn(GEMINI_MODEL_CATALOG, id));
export const modelRouterConfigSchema = z
  .strictObject({
    models: z.array(model).min(1).max(3),
    verifiedModels: z.array(model).min(1).max(3),
    freeTierConfirmed: z.literal(true),
    maxAttempts: z.number().int().min(1).max(2),
    attemptTimeoutMs: z.number().int().min(1).max(90000),
    totalTimeoutMs: z.number().int().min(1).max(90000),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.models).size !== value.models.length ||
      value.models.some((id) => !value.verifiedModels.includes(id)) ||
      value.attemptTimeoutMs > value.totalTimeoutMs
    )
      ctx.addIssue({
        code: "custom",
        message: "Model routing prerequisites not satisfied",
      });
  });
export type ModelRouterConfig = z.infer<typeof modelRouterConfigSchema>;
/** Pure configuration; never inspect credentials or infer billing/project entitlement. */
export function readModelRouterConfig(
  env: NodeJS.ProcessEnv,
): ModelRouterConfig | undefined {
  if (env.SITEFORGE_AI_ROUTER_ENABLED !== "true") return undefined;
  try {
    const fallbacks: unknown = JSON.parse(
      env.SITEFORGE_AI_FALLBACK_MODELS ?? "[]",
    );
    if (!Array.isArray(fallbacks)) throw new Error();
    return modelRouterConfigSchema.parse({
      models: [
        env.SITEFORGE_GEMINI_MODEL ?? "gemini-3.5-flash-lite",
        ...fallbacks,
      ],
      verifiedModels: JSON.parse(env.SITEFORGE_AI_VERIFIED_MODELS ?? "[]"),
      freeTierConfirmed: env.SITEFORGE_AI_FREE_TIER_CONFIRMED === "true",
      maxAttempts: Number(env.SITEFORGE_AI_ROUTER_MAX_ATTEMPTS ?? "2"),
      attemptTimeoutMs: Number(
        env.SITEFORGE_AI_ROUTER_ATTEMPT_TIMEOUT_MS ?? "30000",
      ),
      totalTimeoutMs: Number(
        env.SITEFORGE_AI_ROUTER_TOTAL_TIMEOUT_MS ?? "60000",
      ),
    });
  } catch {
    throw new Error(
      "Model router configuration refused. Verify model eligibility and Free Tier prerequisites.",
    );
  }
}
