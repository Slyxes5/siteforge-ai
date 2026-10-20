import { expect, test } from "vitest";
import { EventEmitter } from "node:events";
import type { Page } from "@playwright/test";
import { observeGeneration } from "../e2e/generation-observer";
test("observer retains safe provider HTTP metadata without reading response bodies", async () => {
  const events = new EventEmitter();
  const request = {
    url: () => "http://127.0.0.1:5189/api/generate",
    method: () => "POST",
  };
  const panel = {
    getByRole: () => ({
      click: async () => {
        events.emit("request", request);
      },
    }),
    evaluate: async () => ({
      state: "provider_error",
      origin: "server",
      requestId: null,
      schemaValidation: "not_attempted",
      transportCalls: "1",
      durationMs: "2",
      blockCount: null,
      preview: false,
      providerStatus: "429",
      providerErrorCategory: "rate_limit_or_quota",
      providerRetryable: "true",
      providerRpcStatus: "RESOURCE_EXHAUSTED",
    }),
  };
  const page = Object.assign(events, {
    getByRole: () => panel,
  }) as unknown as Page;
  const record = await observeGeneration(page, { timeoutMs: 100 });
  expect(record).toMatchObject({
    providerStatus: 429,
    providerErrorCategory: "rate_limit_or_quota",
    providerRetryable: true,
    providerRpcStatus: "RESOURCE_EXHAUSTED",
  });
});

test.each([
  ["client", "429", "rate_limit_or_quota", "true"],
  ["server", "PRIVATE", "rate_limit_or_quota", "true"],
  ["server", "429", "PRIVATE", "true"],
  ["server", "429", "rate_limit_or_quota", "false"],
  ["server", "429", "rate_limit_or_quota", "PRIVATE"],
])(
  "observer drops untrusted or inconsistent provider HTTP DOM metadata",
  async (origin, providerStatus, providerErrorCategory, providerRetryable) => {
    const events = new EventEmitter();
    const request = {
      url: () => "http://127.0.0.1:5189/api/generate",
      method: () => "POST",
    };
    const panel = {
      getByRole: () => ({
        click: async () => {
          events.emit("request", request);
        },
      }),
      evaluate: async () => ({
        state: "provider_error",
        origin,
        requestId: null,
        schemaValidation: "not_attempted",
        transportCalls: "1",
        durationMs: "2",
        blockCount: null,
        preview: false,
        providerStatus,
        providerErrorCategory,
        providerRetryable,
      }),
    };
    const page = Object.assign(events, {
      getByRole: () => panel,
    }) as unknown as Page;
    const record = await observeGeneration(page, { timeoutMs: 100 });
    expect(record).toMatchObject({
      providerStatus: null,
      providerErrorCategory: null,
      providerRetryable: null,
    });
    expect(JSON.stringify(record)).not.toContain("PRIVATE");
  },
);

test("client timeout duration is not mislabeled as a server duration", async () => {
  // Client-origin timing/metadata must not be relabeled as an authoritative server receipt.
  const events = new EventEmitter();
  const request = {
    url: () => "http://127.0.0.1:5189/api/generate",
    method: () => "POST",
  };
  const panel = {
    getByRole: () => ({
      click: async () => {
        events.emit("request", request);
      },
    }),
    evaluate: async () => ({
      state: "timeout",
      origin: "client",
      requestId: null,
      schemaValidation: "not_attempted",
      transportCalls: null,
      durationMs: "90000",
      blockCount: null,
      preview: false,
    }),
  };
  const page = Object.assign(events, {
    getByRole: () => panel,
  }) as unknown as Page;
  expect(
    (await observeGeneration(page, { timeoutMs: 100 })).serverDurationMs,
  ).toBeNull();
});
test("observer has an independent deadline even if browser evaluation never settles", async () => {
  const events = new EventEmitter();
  const request = {
    url: () => "http://127.0.0.1:5189/api/generate",
    method: () => "POST",
  };
  const panel = {
    getByRole: () => ({
      click: async () => {
        events.emit("request", request);
      },
    }),
    evaluate: () => new Promise(() => {}),
  };
  const page = Object.assign(events, {
    getByRole: () => panel,
  }) as unknown as Page;
  const records: Record<string, unknown>[] = [];
  const result = await observeGeneration(page, {
    timeoutMs: 20,
    onProgress: (record) => records.push(record),
  });
  expect(result).toMatchObject({
    phase: "observer_timeout",
    generationPosts: 1,
  });
  expect(result.finishedAt).not.toBeNull();
  expect(records.at(-1)?.phase).toBe("observer_timeout");
});
test("observer refuses submission when the initial evidence writer fails", async () => {
  let clicks = 0;
  const events = new EventEmitter();
  const page = Object.assign(events, {
    getByRole: () => ({
      getByRole: () => ({
        click: async () => {
          clicks++;
        },
      }),
    }),
  }) as unknown as Page;
  const result = await observeGeneration(page, {
    timeoutMs: 20,
    onProgress: () => {
      throw new Error("Synthetic private filesystem diagnostic");
    },
  });
  expect(result).toMatchObject({ phase: "observer_error", generationPosts: 0 });
  expect(clicks).toBe(0);
});

test("observer does not mistake a stale success UI for a new submission", async () => {
  const events = new EventEmitter();
  const panel = {
    getByRole: () => ({ click: async () => {} }),
    evaluate: async () => ({
      state: "success",
      requestId: null,
      schemaValidation: "valid",
      transportCalls: "1",
      durationMs: "2",
      blockCount: "2",
      preview: true,
    }),
  };
  const page = Object.assign(events, {
    getByRole: () => panel,
  }) as unknown as Page;
  const result = await observeGeneration(page, { timeoutMs: 20 });
  expect(result).toMatchObject({
    phase: "observer_timeout",
    generationPosts: 0,
  });
});

test("observer records visible error UI without awaiting a never-finishing response body", async () => {
  const request = {
    url: () => "http://127.0.0.1:5189/api/generate",
    method: () => "POST",
  };
  const response = {
    url: request.url,
    request: () => request,
    status: () => 502,
    headers: () => ({
      "x-siteforge-request-id": "11111111-1111-4111-8111-111111111111",
    }),
    finished: () => new Promise(() => {}),
  };
  const events = new EventEmitter();
  const panel = {
    getByRole: () => ({
      click: async () => {
        events.emit("request", request);
        events.emit("response", response);
      },
    }),
    evaluate: async () => ({
      state: "provider_error",
      requestId: "11111111-1111-4111-8111-111111111111",
      schemaValidation: "not_attempted",
      transportCalls: "1",
      durationMs: "3",
      blockCount: null,
      preview: false,
    }),
  };
  const page = Object.assign(events, {
    getByRole: () => panel,
    waitForResponse: async () => response,
  }) as unknown as Page;
  const records: Record<string, unknown>[] = [];
  const pending = observeGeneration(page, {
    timeoutMs: 25,
    onProgress: (record) => records.push(record),
  });
  const marker = Symbol("observer hanging");
  const result = await Promise.race([
    pending,
    new Promise((resolve) => setTimeout(() => resolve(marker), 70)),
  ]);
  expect(result).not.toBe(marker);
  expect(result).toMatchObject({
    phase: "terminal",
    uiState: "provider_error",
    httpStatus: 502,
    generationPosts: 1,
  });
  expect(records.some((record) => record.phase === "response_headers")).toBe(
    true,
  );
});
