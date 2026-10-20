import { afterEach, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { createSmokeServer } from "./smoke-startup";
import {
  classifyProviderHttp,
  providerHttpDiagnosticsSchema,
} from "../src/ai/provider-http";
import { generationDiagnosticsSchema } from "../src/ai/generation-observation";

const owned: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    owned.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

const cases = [
  [400, "invalid_request", false],
  [401, "authorization", false],
  [403, "authorization", false],
  [404, "model_unavailable", false],
  [429, "rate_limit_or_quota", true],
  [500, "provider_failure", true],
  [502, "provider_failure", true],
  [503, "provider_failure", true],
  [504, "provider_failure", true],
  [599, "provider_failure", true],
  [418, "other_http", false],
  [307, "other_http", false],
] as const;

test.each(cases)(
  "single-request mock HTTP %i preserves safe status/category/retryability without retry",
  async (status, category, retryable) => {
    const logs: string[] = [];
    vi.spyOn(console, "info").mockImplementation((line) => logs.push(line));
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("PRIVATE-PROVIDER-BODY"));
        },
        cancel() {
          cancelled = true;
        },
      }),
      {
        status,
        statusText: "PRIVATE-STATUS-TEXT",
        headers: { "retry-after": "0", "x-private": "PRIVATE-HEADER" },
      },
    );
    const text = vi.spyOn(response, "text"),
      json = vi.spyOn(response, "json"),
      bytes = vi.spyOn(response, "arrayBuffer");
    const transport = vi.fn<typeof fetch>(async () => response);
    // Never consult process.env or select live mode; exercise the actual unchanged budget factory.
    const smoke = createSmokeServer({}, ["--mock"], transport);
    owned.push(smoke.server);
    await new Promise<void>((resolve) =>
      smoke.server.listen(0, "127.0.0.1", resolve),
    );
    const address = smoke.server.address();
    if (!address || typeof address === "string")
      throw Error("Missing loopback address");
    const base = `http://127.0.0.1:${address.port}`;
    const localStatus = await (
      await fetch(base + "/api/generation/status")
    ).json();
    const post = () =>
      fetch(base + "/api/generate", {
        method: "POST",
        headers: {
          Origin: "http://127.0.0.1:5178",
          "Content-Type": "application/json",
          "X-SiteForge-Session": localStatus.sessionToken,
        },
        body: JSON.stringify({
          name: "Synthetic HTTP diagnosis",
          prompt: "PRIVATE-SYNTHETIC-PROMPT",
        }),
      });
    const result = await post();
    const body = await result.json();
    expect(result.status).toBe(502); // SiteForge mapping is deliberately distinct from provider status.
    const expected = {
      providerStatus: status,
      providerErrorCategory: category,
      providerRetryable: retryable,
    };
    expect(body.diagnostics).toMatchObject({
      ...expected,
      outcome: "provider_error",
      schemaValidation: "not_attempted",
      providerAttempts: 1,
      transportCalls: 1,
    });
    expect(body).not.toHaveProperty("candidate");
    expect(
      generationDiagnosticsSchema.safeParse(body.diagnostics).success,
    ).toBe(true);
    expect(JSON.parse(logs[1])).toMatchObject({
      ...expected,
      event: "generation_finish",
      delivery: "finished",
    });
    expect(cancelled).toBe(true);
    expect(text).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
    expect(bytes).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(smoke.outboundRequests()).toBe(1);
    // A second local submission cannot dispatch another configured provider transport.
    expect((await post()).status).toBe(429);
    expect(transport).toHaveBeenCalledTimes(1);
    const safeOutput = JSON.stringify(body) + logs.join("\n");
    expect(safeOutput).not.toMatch(
      /PRIVATE|synthetic-smoke-test-only|sessionToken|x-private|retry-after/i,
    );
    expect(safeOutput).not.toContain(localStatus.sessionToken);
  },
);

test("classification rejects invalid status and inconsistent or arbitrary telemetry", () => {
  for (const status of [undefined, NaN, Infinity, 99, 600, 429.5])
    expect(classifyProviderHttp(status)).toBeUndefined();
  for (const [status, category, retryable] of cases) {
    expect(
      providerHttpDiagnosticsSchema.safeParse({
        providerStatus: status,
        providerErrorCategory: category,
        providerRetryable: retryable,
      }).success,
    ).toBe(true);
  }
  for (const bad of [
    {
      providerStatus: 400,
      providerErrorCategory: "PRIVATE",
      providerRetryable: false,
    },
    {
      providerStatus: 400,
      providerErrorCategory: "authorization",
      providerRetryable: false,
    },
    {
      providerStatus: 429,
      providerErrorCategory: "rate_limit_or_quota",
      providerRetryable: false,
    },
    {
      providerStatus: 429,
      providerErrorCategory: "rate_limit_or_quota",
      providerRetryable: true,
      body: "PRIVATE",
    },
  ])
    expect(providerHttpDiagnosticsSchema.safeParse(bad).success).toBe(false);
});
