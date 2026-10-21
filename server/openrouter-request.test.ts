import { describe, expect, it } from "vitest";
import {
  buildOpenRouterRequestBody,
  OPENROUTER_FREE_MODEL,
} from "./openrouter-request";
import { WEBSITE_PLAN_SYSTEM_PROMPT } from "./website-plan-request";
import { websitePlanJsonSchema } from "../src/ai/website-plan";
const input = { name: "Test", prompt: "Create a page" };
describe("OpenRouter request", () => {
  it.each([
    "nvidia/nemotron-3.5-super-vl",
    "openrouter/free",
    "other:free",
    "",
    [OPENROUTER_FREE_MODEL],
  ])("rejects nonallowlisted models %s", (model) => {
    expect(() => buildOpenRouterRequestBody(input, model as string)).toThrow();
  });
  it.each([
    { ...input, tools: [] },
    { ...input, models: [] },
    { name: "", prompt: "x" },
    { name: "x", prompt: " " },
    { ...input, plugins: [] },
  ])("validates the original strict input %j", (value) => {
    expect(() => buildOpenRouterRequestBody(value)).toThrow();
  });
  it("rejects unsupported runtime output mode", () => {
    expect(() =>
      buildOpenRouterRequestBody(input, undefined, "auto" as never),
    ).toThrow();
  });
  it("supports explicitly selected native strict schema without downgrade", () => {
    const body = JSON.parse(
      buildOpenRouterRequestBody(input, undefined, "json-schema"),
    );
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "siteforge_website_plan",
        strict: true,
        schema: websitePlanJsonSchema,
      },
    });
    expect(body.provider.require_parameters).toBe(true);
    expect(body.provider.allow_fallbacks).toBe(false);
    expect(body.messages[0].content).toContain(WEBSITE_PLAN_SYSTEM_PROMPT);
  });
  it("pins the documented free model and zero-price nonfallback wire contract", () => {
    const body = JSON.parse(buildOpenRouterRequestBody(input));
    expect(body.model).toBe("nvidia/nemotron-3.5-super-vl:free");
    expect(OPENROUTER_FREE_MODEL).toBe(body.model);
    expect(body.provider).toEqual({
      allow_fallbacks: false,
      max_price: { prompt: 0, completion: 0 },
    });
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(8192);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].content).toContain(WEBSITE_PLAN_SYSTEM_PROMPT);
    expect(body.messages[0].content).toContain(
      JSON.stringify(websitePlanJsonSchema),
    );
    expect(body.messages[0].content).toContain("exactly one raw JSON object");
    expect(body.messages[1]).toEqual({
      role: "user",
      content: JSON.stringify(input),
    });
    expect(Object.keys(body).sort()).toEqual(
      ["model", "messages", "provider", "stream", "max_tokens"].sort(),
    );
  });
});
