import { expect, test } from "vitest";
import {
  buildWebsitePlanRequestBody,
  validateWebsitePlanRequest,
  WEBSITE_PLAN_SYSTEM_PROMPT,
} from "./website-plan-request";
import { buildGeminiRequestBody } from "./gemini-request-contract";
import { createGeminiProvider } from "./gemini-provider";
const input = {
  name: "Synthetic",
  prompt: "Exactly hero then contact in Indonesian",
};
const payload = () => JSON.parse(buildWebsitePlanRequestBody(input));
test.each([
  [
    "tools",
    (b: any) => {
      b.tools = [];
    },
    "INVALID_PROVIDER_REQUEST",
  ],
  [
    "schema extension",
    (b: any) => {
      b.generationConfig.responseJsonSchema.properties.blocks.items.properties.text.pattern =
        "PRIVATE";
    },
    "UNSUPPORTED_REQUEST_SCHEMA",
  ],
  [
    "missing block type",
    (b: any) => {
      b.generationConfig.responseJsonSchema.properties.blocks.items.properties.type.enum.pop();
    },
    "UNSUPPORTED_REQUEST_SCHEMA",
  ],
  [
    "missing required field",
    (b: any) => {
      b.generationConfig.responseJsonSchema.properties.blocks.items.required.pop();
    },
    "UNSUPPORTED_REQUEST_SCHEMA",
  ],
  [
    "invalid input",
    (b: any) => {
      b.contents[0].parts[0].text = "{}";
    },
    "INVALID_PROVIDER_REQUEST",
  ],
  [
    "body budget",
    (b: any) => {
      b.contents[0].parts[0].text = "PRIVATE".repeat(10000);
    },
    "PROVIDER_REQUEST_TOO_LARGE",
  ],
] as const)("plan request rejects %s safely", (_name, mutate, reason) => {
  const body = payload();
  mutate(body);
  expect(() => validateWebsitePlanRequest(body)).toThrowError(
    expect.objectContaining({
      code: "REQUEST_CONTRACT",
      retryable: false,
      diagnostic: { stage: "provider_request", reason },
    }),
  );
});
test("cyclic requests fail closed", () => {
  const body = payload();
  body.self = body;
  expect(() => validateWebsitePlanRequest(body)).toThrowError(
    expect.objectContaining({ code: "REQUEST_CONTRACT" }),
  );
});
test("instruction keeps language, order, facts and placeholder guards without canonical IDs", () => {
  for (const rule of [
    "language",
    "order",
    "exact block counts",
    "zero-based",
    "Never invent",
    "placeholder",
    "booking",
    "1..12",
    "4096",
    "untrusted",
  ])
    expect(WEBSITE_PLAN_SYSTEM_PROMPT).toContain(rule);
  expect(Buffer.byteLength(buildWebsitePlanRequestBody(input))).toBeLessThan(
    Buffer.byteLength(buildGeminiRequestBody(input)),
  );
});
test("explicit legacy rollback emits the unchanged legacy body with one transport and no fallback", async () => {
  let sent = "",
    calls = 0;
  const provider = createGeminiProvider({
    contract: "m2c",
    apiKey: "synthetic-test-only",
    fetch: async (_url, init) => {
      calls++;
      sent = String(init?.body);
      return Response.json(
        { error: { code: 400, status: "INVALID_ARGUMENT" } },
        { status: 400 },
      );
    },
  });
  await expect(
    provider.generate(input, new AbortController().signal),
  ).rejects.toMatchObject({ status: 400, retryable: false });
  expect(provider.outputFormat).toBe("m2c");
  expect(sent).toBe(buildGeminiRequestBody(input));
  expect(calls).toBe(1);
});
