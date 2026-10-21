import { expect, test } from "vitest";
import {
  buildGeminiRequestBody,
  validateGeminiRequestPayload,
} from "./gemini-request-contract";
import { GENERATION_SYSTEM_PROMPT_V2 } from "./generation-prompt";
import { generatedContentJsonSchema } from "../src/ai/generation-content";
import { coffeeAcceptance } from "../scripts/coffee-acceptance-scenario";
const input = { name: coffeeAcceptance.name, prompt: coffeeAcceptance.prompt };
const payload = () => JSON.parse(buildGeminiRequestBody(input));

import { GEMINI_REQUEST_GUARDS } from "./gemini-request-contract";

const mutations: Array<[string, (body: any) => void, string]> = [
  [
    "incompatible responseSchema",
    (b) => {
      b.generationConfig.responseSchema = {};
    },
    "INVALID_PROVIDER_REQUEST",
  ],
  [
    "mixed responseFormat",
    (b) => {
      b.generationConfig.responseFormat = {};
    },
    "INVALID_PROVIDER_REQUEST",
  ],
  [
    "wrong MIME",
    (b) => {
      b.generationConfig.responseMimeType = "text/plain";
    },
    "INVALID_PROVIDER_REQUEST",
  ],
  [
    "changed output limit",
    (b) => {
      b.generationConfig.maxOutputTokens = 999999;
    },
    "INVALID_PROVIDER_REQUEST",
  ],
  [
    "tools",
    (b) => {
      b.tools = [{ PRIVATE: "PRIVATE" }];
    },
    "INVALID_PROVIDER_REQUEST",
  ],
  [
    "wrong user role",
    (b) => {
      b.contents[0].role = "model";
    },
    "INVALID_PROVIDER_REQUEST",
  ],
  [
    "empty user input",
    (b) => {
      b.contents[0].parts[0].text = JSON.stringify({
        name: "Demo",
        prompt: "",
      });
    },
    "INVALID_PROVIDER_REQUEST",
  ],
  [
    "unknown request field",
    (b) => {
      b.contents[0].parts[0].text = JSON.stringify({
        name: "Demo",
        prompt: "Synthetic",
        PRIVATE: "PRIVATE",
      });
    },
    "INVALID_PROVIDER_REQUEST",
  ],
  [
    "non-JSON user data",
    (b) => {
      b.contents[0].parts[0].text = "PRIVATE";
    },
    "INVALID_PROVIDER_REQUEST",
  ],
  [
    "unsupported projection keyword",
    (b) => {
      b.generationConfig.responseJsonSchema.properties.blocks.items.anyOf[0].properties.text.pattern =
        "PRIVATE";
    },
    "UNSUPPORTED_REQUEST_SCHEMA",
  ],
  [
    "missing required property",
    (b) => {
      b.generationConfig.responseJsonSchema.properties.blocks.items.anyOf[0].required.pop();
    },
    "UNSUPPORTED_REQUEST_SCHEMA",
  ],
  [
    "duplicate block variant",
    (b) => {
      const a =
        b.generationConfig.responseJsonSchema.properties.blocks.items.anyOf;
      a[7] = a[0];
    },
    "UNSUPPORTED_REQUEST_SCHEMA",
  ],
  [
    "array bounds mismatch",
    (b) => {
      b.generationConfig.responseJsonSchema.properties.blocks.items.anyOf[6].properties.items.maxItems = 0;
    },
    "UNSUPPORTED_REQUEST_SCHEMA",
  ],
  [
    "schema node budget",
    (b) => {
      for (const variant of b.generationConfig.responseJsonSchema.properties
        .blocks.items.anyOf)
        for (let i = 0; i < 32; i++) {
          const key = `extra${i}`;
          variant.properties[key] = { type: "string" };
          variant.required.push(key);
        }
    },
    "UNSUPPORTED_REQUEST_SCHEMA",
  ],
  [
    "schema byte budget",
    (b) => {
      b.generationConfig.responseJsonSchema.description = "PRIVATE".repeat(
        5000,
      );
    },
    "PROVIDER_REQUEST_TOO_LARGE",
  ],
  [
    "request byte budget",
    (b) => {
      b.contents[0].parts[0].text = "PRIVATE".repeat(10000);
    },
    "PROVIDER_REQUEST_TOO_LARGE",
  ],
  [
    "schema depth budget",
    (b) => {
      let node: any = { type: "string" };
      for (let i = 0; i < GEMINI_REQUEST_GUARDS.schemaDepth; i++)
        node = { type: "array", minItems: 1, maxItems: 1, items: node };
      b.generationConfig.responseJsonSchema.properties.blocks.items.anyOf[0].properties.text =
        node;
    },
    "UNSUPPORTED_REQUEST_SCHEMA",
  ],
];

test.each(mutations)(
  "fails closed with safe reason: %s",
  (_name, mutate, reason) => {
    const body = payload();
    mutate(body);
    try {
      validateGeminiRequestPayload(body);
      throw new Error("Expected contract rejection");
    } catch (error) {
      expect(error).toMatchObject({
        code: "REQUEST_CONTRACT",
        diagnostic: { stage: "provider_request", reason },
        retryable: false,
      });
      expect(JSON.stringify(error)).not.toContain("PRIVATE");
    }
  },
);

test("cyclic schema cannot escape as an arbitrary serialization error", () => {
  const body = payload();
  body.generationConfig.responseJsonSchema.self = body;
  expect(() => validateGeminiRequestPayload(body)).toThrowError(
    expect.objectContaining({
      code: "REQUEST_CONTRACT",
      diagnostic: {
        stage: "provider_request",
        reason: "INVALID_PROVIDER_REQUEST",
      },
    }),
  );
});

test("valid eight-block payload is byte-identical to the pre-guard M2C envelope", () => {
  const expected = JSON.stringify({
    systemInstruction: { parts: [{ text: GENERATION_SYSTEM_PROMPT_V2 }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: generatedContentJsonSchema,
      maxOutputTokens: 4096,
    },
  });
  expect(buildGeminiRequestBody(input)).toBe(expected);
});

test("request schema cannot silently omit a supported M2C block type", () => {
  const body = payload();
  body.generationConfig.responseJsonSchema.properties.blocks.items.anyOf.pop();
  expect(() => validateGeminiRequestPayload(body)).toThrowError(
    expect.objectContaining({
      code: "REQUEST_CONTRACT",
      diagnostic: {
        stage: "provider_request",
        reason: "UNSUPPORTED_REQUEST_SCHEMA",
      },
    }),
  );
});
