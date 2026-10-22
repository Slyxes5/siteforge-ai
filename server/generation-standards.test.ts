import { expect, test } from "vitest";
import {
  buildWebsitePlanRequestBody,
  WEBSITE_PLAN_SYSTEM_PROMPT,
} from "./website-plan-request";
import { buildOpenRouterRequestBody } from "./openrouter-request";
import { buildGeminiRequestBody } from "./gemini-request-contract";
import { GENERATION_SYSTEM_PROMPT_V2 } from "./generation-prompt";
import {
  completenessProfileIds,
  GENERATION_COMPLETENESS_POLICY,
} from "../src/ai/generation-standards";

test.each(completenessProfileIds)(
  "%s reaches both providers and legacy without widening output schema",
  (completenessProfile) => {
    const input = {
      name: "Fixture",
      prompt: "Tepat dua blok hero dan kontak",
      completenessProfile,
    };
    const gemini = JSON.parse(buildWebsitePlanRequestBody(input));
    const router = JSON.parse(buildOpenRouterRequestBody(input));
    const legacy = JSON.parse(buildGeminiRequestBody(input));
    expect(JSON.parse(gemini.contents[0].parts[0].text)).toEqual(input);
    expect(JSON.parse(router.messages[1].content)).toEqual(input);
    expect(JSON.parse(legacy.contents[0].parts[0].text)).toEqual(input);
    expect(router.provider).toEqual({
      allow_fallbacks: false,
      max_price: { prompt: 0, completion: 0 },
    });
    expect(
      gemini.generationConfig.responseJsonSchema.properties,
    ).not.toHaveProperty("completenessProfile");
  },
);

test("standards supplement constrained briefs and keep unknown facts empty on both prompt paths", () => {
  for (const prompt of [
    WEBSITE_PLAN_SYSTEM_PROMPT,
    GENERATION_SYSTEM_PROMPT_V2,
  ]) {
    expect(prompt).toContain(GENERATION_COMPLETENESS_POLICY);
    expect(prompt).toContain("exact block counts/order");
    expect(prompt).toContain("Unknown structured facts stay empty");
    expect(prompt).toContain("no invented client projects");
  }
});
