import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  observeGeneration,
  type GenerationObservation,
} from "./generation-observer";
import { generationDiagnosticsSchema } from "../src/ai/generation-observation";
const logPath = resolve("test-results/observability-fixture.jsonl");
function events(): Array<Record<string, unknown>> {
  return existsSync(logPath)
    ? readFileSync(logPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
}
async function prepare(page: Page, kind: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Generate website", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Website generator",
    exact: true,
  });
  await panel.getByLabel("Website name").fill("OBS:" + kind);
  await panel
    .getByLabel("Website prompt")
    .fill("Synthetic test content only. Do not include private data.");
  return panel;
}
function progress(record: GenerationObservation) {
  writeFileSync(
    test.info().outputPath("generation-observation.json"),
    JSON.stringify(record, null, 2),
  );
}
async function terminalEvent(id: string | null) {
  expect(id).not.toBeNull();
  await expect
    .poll(
      () =>
        events().filter(
          (item) => item.event === "generation_finish" && item.requestId === id,
        ).length,
    )
    .toBe(1);
  return events().find(
    (item) => item.event === "generation_finish" && item.requestId === id,
  )!;
}
test.beforeEach(async ({ context }) => {
  // No external browser resource may be fetched. The fixture separately blocks native fetch.
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === "http://127.0.0.1:5189"
      ? route.continue()
      : route.abort(),
  );
});
for (const [kind, state, status, schema] of [
  ["slow", "success", 200, "valid"],
  ["signature", "success", 200, "valid"],
  ["unicode", "success", 200, "valid"],
  ["400", "provider_error", 502, "not_attempted"],
  ["401", "provider_error", 502, "not_attempted"],
  ["403", "provider_error", 502, "not_attempted"],
  ["404", "provider_error", 502, "not_attempted"],
  ["429", "provider_error", 502, "not_attempted"],
  ["500", "provider_error", 502, "not_attempted"],
  ["503", "provider_error", 502, "not_attempted"],
  ["malformed", "validation_error", 502, "invalid"],
  ["unsupported", "validation_error", 502, "invalid"],
  ["stream", "timeout", 504, "not_attempted"],
  ["timeout", "timeout", 504, "not_attempted"],
] as const)
  test(
    "observability: " + kind + " ends visibly as " + state,
    async ({ page }) => {
      const panel = await prepare(page, kind);
      const result = await observeGeneration(page, {
        timeoutMs: 8000,
        onProgress: progress,
      });
      expect(result).toMatchObject({
        phase: "terminal",
        generationPosts: 1,
        uiState: state,
        httpStatus: status,
        schemaValidation: schema,
        transportCalls: 1,
        candidatePreview: state === "success",
      });
      await expect(panel).toHaveAttribute("data-generation-state", state);
      await expect(
        panel.getByRole("button", { name: "Generate candidate", exact: true }),
      ).toBeEnabled();
      if (state === "success") {
        expect(result.blockCount).toBe(2);
        await expect(
          panel.getByRole("region", { name: "Candidate preview" }),
        ).toBeVisible();
        if (kind === "slow")
          expect(result.serverDurationMs).toBeGreaterThanOrEqual(50);
      } else {
        await expect(panel.getByRole("alert")).toBeVisible();
        await expect(
          panel.getByRole("region", { name: "Candidate preview" }),
        ).toHaveCount(0);
      }
      expect(await page.evaluate(() => localStorage.length)).toBe(0);
      await expect(panel).not.toContainText("PRIVATE");
      const event = await terminalEvent(result.requestId);
      expect(event).toMatchObject({
        outcome: state,
        schemaValidation: schema,
        transportCalls: 1,
        delivery: "finished",
      });
      const httpCategories: Record<string, string> = {
        "400": "invalid_request",
        "401": "authorization",
        "403": "authorization",
        "404": "model_unavailable",
        "429": "rate_limit_or_quota",
        "500": "provider_failure",
        "503": "provider_failure",
      };
      if (httpCategories[kind]) {
        const expected = {
          providerStatus: Number(kind),
          providerErrorCategory: httpCategories[kind],
          providerRetryable: ["429", "500", "503"].includes(kind),
        };
        expect(result).toMatchObject(expected);
        expect(event).toMatchObject(expected);
        await expect(
          panel.getByRole("status", { name: "Generation status" }),
        ).toContainText(`Provider HTTP: ${kind}`);
      } else {
        expect(result.providerStatus).toBeNull();
        expect(result.providerErrorCategory).toBeNull();
        expect(result.providerRetryable).toBeNull();
      }
      await panel.screenshot({
        path: test.info().outputPath("terminal-" + state + ".png"),
      });
    },
  );

for (const [kind, reason, transports, rpc] of [
  ["request-contract", "INVALID_PROVIDER_REQUEST", 0, null],
  ["rpc-invalid", "HTTP_ERROR", 1, "INVALID_ARGUMENT"],
  ["rpc-precondition", "HTTP_ERROR", 1, "FAILED_PRECONDITION"],
] as const)
  test(
    "request contract/RPC diagnostic reaches observer: " + kind,
    async ({ page }) => {
      const panel = await prepare(page, kind);
      const result = await observeGeneration(page, {
        timeoutMs: 8000,
        onProgress: progress,
      });
      const expected = {
        phase: "terminal",
        generationPosts: 1,
        uiState: "provider_error",
        httpStatus: 502,
        schemaValidation: "not_attempted",
        transportCalls: transports,
        candidatePreview: false,
        providerStatus: rpc ? 400 : null,
        providerRpcStatus: rpc,
        problem: {
          stage: rpc ? "provider_transport" : "provider_request",
          reason,
        },
      };
      expect(result).toMatchObject(expected);
      const event = await terminalEvent(result.requestId);
      expect(event).toMatchObject({
        outcome: "provider_error",
        transportCalls: transports,
        problem: expected.problem,
      });
      if (rpc) {
        expect(event.providerRpcStatus).toBe(rpc);
        await expect(
          panel.getByRole("status", { name: "Generation status" }),
        ).toContainText(`Provider RPC: ${rpc}`);
      }
      await expect(panel).not.toContainText("PRIVATE");
      expect(await page.evaluate(() => localStorage.length)).toBe(0);
      await panel.screenshot({
        path: test.info().outputPath(`request-${kind}.png`),
      });
    },
  );

for (const [kind, stage, reason] of [
  // Content/output validation cases remain separate from provider-request contract checks.
  ["empty", "provider_envelope", "EMPTY_RESPONSE"],
  ["truncated", "provider_envelope", "OUTPUT_TRUNCATED"],
  ["refusal", "provider_envelope", "PROVIDER_REFUSAL"],
  ["contentjson", "content_json", "MALFORMED_CONTENT_JSON"],
  ["missingfield", "structured_output", "STRUCTURED_CONTENT_REJECTED"],
  ["ungrounded", "content_semantics", "UNSUPPORTED_BUSINESS_FACT"],
] as const)
  test(
    "validation diagnostic reaches UI and observer: " + kind,
    async ({ page }) => {
      const panel = await prepare(page, kind);
      const result = await observeGeneration(page, {
        timeoutMs: 8000,
        onProgress: progress,
      });
      expect(result).toMatchObject({
        phase: "terminal",
        uiState: "validation_error",
        generationPosts: 1,
        transportCalls: 1,
        candidatePreview: false,
        problem: { stage, reason },
      });
      await expect(
        panel.getByRole("status", { name: "Generation status" }),
      ).toContainText(reason);
      if (kind === "missingfield") {
        expect(result).toMatchObject({
          problem: {
            issues: expect.arrayContaining([
              { code: "invalid_type", path: "blocks[0].text" },
            ]),
          },
        });
        await expect(panel).toContainText("blocks[0].text");
      }
      await expect(panel).not.toContainText("PRIVATE");
      expect(await page.evaluate(() => localStorage.length)).toBe(0);
      const event = await terminalEvent(result.requestId);
      expect(event).toMatchObject({
        problem: { stage, reason },
        delivery: "finished",
      });
      await panel.screenshot({
        path: test.info().outputPath("validation-" + kind + ".png"),
      });
    },
  );

test("observability: cancellation clears loading and ignores delayed mock output", async ({
  page,
}) => {
  const panel = await prepare(page, "cancel");
  const before = events().filter(
    (event) => event.event === "generation_start",
  ).length;
  const result = await observeGeneration(page, {
    timeoutMs: 8000,
    onProgress: progress,
    afterSubmit: async () => {
      await expect
        .poll(
          () =>
            events().filter((event) => event.event === "generation_start")
              .length,
        )
        .toBeGreaterThan(before);
      await panel
        .getByRole("button", { name: "Cancel generation", exact: true })
        .click();
    },
  });
  expect(result).toMatchObject({
    phase: "terminal",
    generationPosts: 1,
    uiState: "cancelled",
    candidatePreview: false,
  });
  await expect(
    panel.getByRole("button", { name: "Generate candidate", exact: true }),
  ).toBeEnabled();
  await expect(
    panel.getByRole("button", { name: "Cancel generation", exact: true }),
  ).toHaveCount(0);
  const start = events()
    .filter((event) => event.event === "generation_start")
    .at(-1)!;
  const event = await terminalEvent(start.requestId as string);
  expect(event).toMatchObject({
    outcome: "cancelled",
    delivery: "disconnected",
  });
  expect(Number(event.transportCalls)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("observability: stalled HTTP delivery cannot leave the UI or observer loading forever", async ({
  page,
}) => {
  await page.clock.install();
  await page.setExtraHTTPHeaders({ "X-SiteForge-Fixture": "delivery_stall" });
  const panel = await prepare(page, "slow");
  let oldBodyWaitSettled = false;
  const headers = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/generate",
    { timeout: 5000 },
  );
  const result = await observeGeneration(page, {
    timeoutMs: 10000,
    onProgress: progress,
    afterSubmit: async () => {
      const response = await headers;
      void response.finished().then(
        () => {
          oldBodyWaitSettled = true;
        },
        () => {
          oldBodyWaitSettled = true;
        },
      );
      expect(oldBodyWaitSettled).toBe(false);
      // Exercise the real browser deadline without waiting 90 wall-clock seconds.
      await page.clock.fastForward(90001);
    },
  });
  expect(result).toMatchObject({
    phase: "terminal",
    generationPosts: 1,
    httpStatus: 200,
    uiState: "timeout",
    candidatePreview: false,
    serverDurationMs: null,
  });
  await expect(panel.getByRole("alert")).toContainText(/timed out/i);
  await expect(
    panel.getByRole("button", { name: "Generate candidate", exact: true }),
  ).toBeEnabled();
  const event = await terminalEvent(result.requestId);
  expect(event).toMatchObject({
    outcome: "cancelled",
    delivery: "disconnected",
    schemaValidation: "valid",
    transportCalls: 1,
  });
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await panel.screenshot({
    path: test.info().outputPath("stalled-delivery-timeout.png"),
  });
});

test("observability: telemetry is exactly-once, allowlisted and free of raw synthetic secrets", async () => {
  const records = events();
  expect(records.length).toBeGreaterThan(0);
  const starts = records.filter((event) => event.event === "generation_start");
  const finishes = records.filter(
    (event) => event.event === "generation_finish",
  );
  expect(finishes).toHaveLength(starts.length);
  for (const start of starts) {
    expect(
      finishes.filter((event) => event.requestId === start.requestId),
    ).toHaveLength(1);
    expect(Object.keys(start).sort()).toEqual([
      "event",
      "requestId",
      "startedAt",
    ]);
  }
  for (const finish of finishes) {
    const { event, delivery, ...diagnostics } = finish;
    expect(generationDiagnosticsSchema.safeParse(diagnostics).success).toBe(
      true,
    );
    expect(["finished", "disconnected"]).toContain(delivery);
  }
  const text = JSON.stringify(records);
  expect(text).not.toMatch(
    /PRIVATE|sessionToken|x-siteforge-session|"authorization"\s*:|x-goog-api-key|synthetic-smoke-test-only/i,
  );
});
