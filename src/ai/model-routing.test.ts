import { expect, test } from "vitest";
import { modelRoutingSchema } from "./model-routing";
import { generationDiagnosticsSchema } from "./generation-observation";
const routing = {
  selectedModel: "gemini-3.8-flash",
  outboundRequests: 2,
  attempts: [
    {
      model: "gemini-3.5-flash-lite",
      reason: "primary",
      outcome: "http_rejected",
      outbound: 1,
      providerStatus: 503,
    },
    {
      model: "gemini-3.8-flash",
      reason: "http_503",
      outcome: "returned",
      outbound: 1,
    },
  ],
};
test("safe model route metadata accepts a completed two-attempt route", () => {
  expect(modelRoutingSchema.safeParse(routing).success).toBe(true);
});
test.each([
  { ...routing, prompt: "PRIVATE" },
  { ...routing, outboundRequests: 3 },
  { ...routing, outboundRequests: 1 },
  { ...routing, selectedModel: "gemini-unknown" },
  { ...routing, attempts: [routing.attempts[0], routing.attempts[0]] },
  { ...routing, attempts: [{ ...routing.attempts[0], body: "PRIVATE" }] },
  { ...routing, attempts: [{ ...routing.attempts[0], reason: "PRIVATE" }] },
])("rejects unknown/unbounded/inconsistent routing metadata %#", (value) => {
  expect(modelRoutingSchema.safeParse(value).success).toBe(false);
});
test("legacy generation receipts remain valid without routing metadata", () => {
  expect(
    generationDiagnosticsSchema.safeParse({
      requestId: "29b81ea9-18ac-49ad-a90e-1e308a06c5ac",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:01.000Z",
      durationMs: 1000,
      outcome: "success",
      schemaValidation: "valid",
      providerAttempts: 1,
      transportCalls: 1,
      httpStatus: 200,
    }).success,
  ).toBe(true);
});
