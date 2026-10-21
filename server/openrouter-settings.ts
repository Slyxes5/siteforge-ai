import { z } from "zod";
const settingsSchema = z.strictObject({
  model: z.literal("nvidia/nemotron-3.5-super-vl:free"),
  outputMode: z.enum(["prompt-json", "json-schema"]),
  timeoutMs: z.number().int().min(1).max(45000),
});
/** Pure public settings parser. Never access a key, account, guardrail API or model discovery. */
export function readOpenRouterSettings(
  env: NodeJS.ProcessEnv,
): z.infer<typeof settingsSchema> {
  if (env.SITEFORGE_OPENROUTER_FREE_ONLY_CONFIRMED !== "true")
    throw new Error(
      "OpenRouter configuration refused: free-only guardrail confirmation is required.",
    );
  const parsed = settingsSchema.safeParse({
    model:
      env.SITEFORGE_OPENROUTER_MODEL ?? "nvidia/nemotron-3.5-super-vl:free",
    outputMode: env.SITEFORGE_OPENROUTER_OUTPUT_MODE ?? "prompt-json",
    timeoutMs: Number(env.SITEFORGE_OPENROUTER_TIMEOUT_MS ?? "45000"),
  });
  if (!parsed.success)
    throw new Error(
      "OpenRouter configuration refused: unsupported public settings.",
    );
  return parsed.data;
}
