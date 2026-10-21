export const OPENROUTER_FREE_MODEL = "nvidia/nemotron-3.5-super-vl:free";
export type OpenRouterOutputMode = "prompt-json" | "json-schema";
import { WEBSITE_PLAN_SYSTEM_PROMPT } from "./website-plan-request";
import { websitePlanJsonSchema } from "../src/ai/website-plan";
import { websiteGenerationRequestSchema } from "../src/ai/website-generation";
import { ProviderError } from "./provider-error";
export function buildOpenRouterRequestBody(
  input: unknown,
  model = OPENROUTER_FREE_MODEL,
  outputMode: OpenRouterOutputMode = "prompt-json",
): string {
  const request = websiteGenerationRequestSchema.safeParse(input);
  if (
    model !== OPENROUTER_FREE_MODEL ||
    !["prompt-json", "json-schema"].includes(outputMode) ||
    !request.success
  ) {
    throw new ProviderError("REQUEST_CONTRACT", undefined, undefined, {
      stage: "provider_request",
      reason: "INVALID_PROVIDER_REQUEST",
    });
  }
  const maxTokens = 8192;
  return JSON.stringify({
    model,
    stream: false,
    max_tokens: maxTokens,
    ...(outputMode === "json-schema"
      ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "siteforge_website_plan",
              strict: true,
              schema: websitePlanJsonSchema,
            },
          },
        }
      : {}),
    provider: {
      allow_fallbacks: false,
      max_price: { prompt: 0, completion: 0 },
      ...(outputMode === "json-schema" ? { require_parameters: true } : {}),
    },
    messages: [
      {
        role: "system",
        content: `${WEBSITE_PLAN_SYSTEM_PROMPT}\nReturn exactly one raw JSON object, no markdown. The local compiler remains authoritative.\nJSON schema: ${JSON.stringify(websitePlanJsonSchema)}`,
      },
      { role: "user", content: JSON.stringify(request.data) },
    ],
  });
}
