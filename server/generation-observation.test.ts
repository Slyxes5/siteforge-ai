import { afterEach, expect, test, vi } from "vitest";
import { request as httpRequest, type Server } from "node:http";
import { getEventListeners } from "node:events";
import {
  createGenerationServer,
  type GenerationServerOptions,
} from "./generation-server";
import type { WebsiteGenerationProvider } from "../src/ai/website-generation";
import { ProviderError } from "./provider-error";
import { createGeminiProvider } from "./gemini-provider";
import { generationDiagnosticsSchema } from "../src/ai/generation-observation";
test.each([
  ["not JSON PRIVATE", "provider_envelope", "MALFORMED_ENVELOPE_JSON"],
  ["", "provider_envelope", "EMPTY_RESPONSE"],
  [
    JSON.stringify({ candidates: [] }),
    "provider_envelope",
    "INVALID_PROVIDER_ENVELOPE",
  ],
  [
    JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
    "provider_envelope",
    "OUTPUT_TRUNCATED",
  ],
  [
    JSON.stringify({ candidates: [{ finishReason: "SAFETY" }] }),
    "provider_envelope",
    "PROVIDER_REFUSAL",
  ],
  ...[
    ["", "content_json", "EMPTY_CONTENT"],
    ["not JSON PRIVATE", "content_json", "MALFORMED_CONTENT_JSON"],
    [
      JSON.stringify({ blocks: [{ id: "x", type: "heading" }] }),
      "structured_output",
      "STRUCTURED_CONTENT_REJECTED",
    ],
    [
      JSON.stringify({
        blocks: [
          { id: "x", type: "button", text: "Synthetic", href: "#missing" },
        ],
      }),
      "content_semantics",
      "UNKNOWN_SECTION_ANCHOR",
    ],
  ].map(([text, stage, reason]) => [
    JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }],
    }),
    stage,
    reason,
  ]),
])("safe reason tracer: %s", async (raw, stage, reason) => {
  const events: unknown[] = [];
  const transport = vi.fn<typeof fetch>(async () => new Response(raw));
  const s = await setup({
    maxAttempts: 1,
    provider: createGeminiProvider({
      contract: "m2c",
      apiKey: "synthetic-test-only",
      fetch: transport,
    }),
    onGenerationEvent: (e) => events.push(e),
  });
  const response = await s.post();
  const body = await response.json();
  expect(response.status).toBe(502);
  expect(body.diagnostics).toMatchObject({
    problem: { stage, reason },
    outcome: "validation_error",
    providerAttempts: 1,
    transportCalls: 1,
  });
  expect(events[1]).toMatchObject({
    problem: { stage, reason },
    delivery: "finished",
  });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(body)).not.toMatch(
    /PRIVATE|synthetic-test-only|sessionToken/,
  );
  expect(generationDiagnosticsSchema.safeParse(body.diagnostics).success).toBe(
    true,
  );
});
test.each(["http", "network"] as const)(
  "provider transport %s has a distinct safe reason",
  async (kind) => {
    const s = await setup({
      maxAttempts: 1,
      onGenerationEvent: () => {},
      provider: createGeminiProvider({
        contract: "m2c",
        apiKey: "synthetic-test-only",
        fetch: async () => {
          if (kind === "network") throw Error("PRIVATE-TRANSPORT-ERROR");
          return new Response("PRIVATE-PROVIDER-BODY", { status: 429 });
        },
      }),
    });
    const body = await (await s.post()).json();
    expect(body.diagnostics).toMatchObject({
      outcome: "provider_error",
      schemaValidation: "not_attempted",
      problem: {
        stage: "provider_transport",
        reason: kind === "http" ? "HTTP_ERROR" : "NETWORK_ERROR",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE/);
  },
);
test("HTTP 400 retains safe category and retryability through receipt and finish event", async () => {
  const events: unknown[] = [];
  const transport = vi.fn<typeof fetch>(
    async () => new Response("PRIVATE-PROVIDER-BODY", { status: 400 }),
  );
  const s = await setup({
    maxAttempts: 1,
    provider: createGeminiProvider({
      contract: "m2c",
      apiKey: "synthetic-test-only",
      fetch: transport,
    }),
    onGenerationEvent: (e) => events.push(e),
  });
  const response = await s.post();
  const body = await response.json();
  expect(response.status).toBe(502);
  const expected = {
    providerStatus: 400,
    providerErrorCategory: "invalid_request",
    providerRetryable: false,
  };
  expect(body.diagnostics).toMatchObject(expected);
  expect(events[1]).toMatchObject(expected);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(JSON.stringify({ body, events })).not.toMatch(
    /PRIVATE|synthetic-test-only|sessionToken/,
  );
});

test("successful standard-backend retry does not retain an earlier HTTP failure status", async () => {
  let calls = 0;
  const s = await setup({
    retryDelayMs: 1,
    onGenerationEvent: () => {},
    provider: createGeminiProvider({
      contract: "m2c",
      apiKey: "synthetic-test-only",
      fetch: async () => {
        if (++calls === 1) return new Response("PRIVATE", { status: 429 });
        return Response.json({
          candidates: [
            { finishReason: "STOP", content: { parts: [{ text: fixture }] } },
          ],
        });
      },
    }),
  });
  const body = await (await s.post()).json();
  expect(body.diagnostics.outcome).toBe("success");
  expect(body.diagnostics).not.toHaveProperty("providerStatus");
  expect(body.diagnostics).not.toHaveProperty("providerErrorCategory");
  expect(body.diagnostics).not.toHaveProperty("providerRetryable");
  expect(calls).toBe(2);
});

test("canonical rejection remains distinct in delivered telemetry", async () => {
  const events: unknown[] = [];
  const s = await setup({
    provider: { ...provider, model: "x".repeat(101) },
    onGenerationEvent: (e) => events.push(e),
  });
  const body = await (await s.post()).json();
  expect(body.diagnostics).toMatchObject({
    outcome: "validation_error",
    problem: {
      stage: "canonical_project",
      reason: "CANONICAL_PROJECT_REJECTED",
      issues: [{ code: "too_big", path: "generation.model" }],
    },
  });
  expect(events[1]).toMatchObject({
    problem: body.diagnostics.problem,
    delivery: "finished",
  });
});
const fixture = JSON.stringify({
  blocks: [{ id: "intro", type: "heading", text: "Hello" }],
});
const provider: WebsiteGenerationProvider = {
  id: "mock",
  model: "sensitive-model",
  generate: async () => ({ text: fixture }),
};
const owned: Server[] = [];
afterEach(async () => {
  await Promise.all(
    owned.splice(0).map(
      (s) =>
        new Promise<void>((r) => {
          s.closeAllConnections();
          s.close(() => r());
        }),
    ),
  );
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function setup(options: GenerationServerOptions = {}) {
  const server = createGenerationServer(options);
  owned.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("address");
  const base = `http://127.0.0.1:${address.port}`;
  const status = await (await fetch(base + "/api/generation/status")).json();
  const headers = {
    Origin: "http://127.0.0.1:5178",
    "Content-Type": "application/json",
    "X-SiteForge-Session": status.sessionToken,
  };
  const post = (
    body = JSON.stringify({ name: "Demo", prompt: "sensitive-prompt" }),
    extra = {},
  ) =>
    fetch(base + "/api/generate", {
      method: "POST",
      headers: { ...headers, ...extra },
      body,
    });
  return { server, base, headers, post, status };
}
test("success has server-owned correlation, zero mock transports, and one finish event after HTTP finish", async () => {
  const events: unknown[] = [];
  const s = await setup({
    provider,
    onGenerationEvent: (event) => events.push(event),
  });
  expect(events).toEqual([]);
  const response = await s.post(undefined, {
    "X-SiteForge-Request-Id": "caller-controlled",
  });
  const body = await response.json();
  expect(body.diagnostics).toMatchObject({
    outcome: "success",
    schemaValidation: "valid",
    providerAttempts: 1,
    transportCalls: 0,
    httpStatus: 200,
  });
  expect(body.diagnostics.requestId).toBe(
    response.headers.get("x-siteforge-request-id"),
  );
  expect(body.diagnostics.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(body.diagnostics.startedAt).toEqual(expect.any(String));
  expect(body.diagnostics.durationMs).toBeGreaterThanOrEqual(0);
  await wait(5);
  expect(events).toHaveLength(2);
  expect(events[0]).toEqual({
    event: "generation_start",
    requestId: body.diagnostics.requestId,
    startedAt: body.diagnostics.startedAt,
  });
  expect(events[1]).toMatchObject({
    event: "generation_finish",
    requestId: body.diagnostics.requestId,
    outcome: "success",
    delivery: "finished",
  });
  expect(generationDiagnosticsSchema.safeParse(body.diagnostics).success).toBe(
    true,
  );
});

test.each([429, 500])(
  "safe HTTP %i diagnostics count provider attempts separately from configured transport",
  async (status) => {
    const events: unknown[] = [];
    let calls = 0;
    const s = await setup({
      retryDelayMs: 1,
      onGenerationEvent: (e) => events.push(e),
      provider: createGeminiProvider({
        contract: "m2c",
        apiKey: "synthetic-only",
        fetch: async () => {
          calls++;
          return new Response("sensitive-body", { status });
        },
      }),
    });
    const response = await s.post();
    const body = await response.json();
    expect(body).toMatchObject({
      error: { code: "PROVIDER_ERROR" },
      diagnostics: {
        outcome: "provider_error",
        schemaValidation: "not_attempted",
        providerAttempts: 2,
        transportCalls: 2,
        httpStatus: 502,
        providerStatus: status,
      },
    });
    expect(calls).toBe(2);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      requestId: body.diagnostics.requestId,
      outcome: "provider_error",
      providerStatus: status,
      delivery: "finished",
    });
  },
);

test.each(["bad JSON", JSON.stringify({ blocks: [] })])(
  "invalid generated content is validation_error without retry",
  async (text) => {
    const s = await setup({
      provider: { ...provider, generate: async () => ({ text }) },
      onGenerationEvent: () => {},
    });
    expect(await (await s.post()).json()).toMatchObject({
      diagnostics: {
        outcome: "validation_error",
        schemaValidation: "invalid",
        providerAttempts: 1,
        transportCalls: 0,
      },
    });
  },
);

test.each(["INVALID_OUTPUT", "TOO_LARGE", "REFUSAL"] as const)(
  "adapter %s is validation_error",
  async (code) => {
    const s = await setup({
      provider: {
        ...provider,
        generate: async () => {
          throw new ProviderError(code);
        },
      },
      onGenerationEvent: () => {},
    });
    expect(await (await s.post()).json()).toMatchObject({
      diagnostics: {
        outcome: "validation_error",
        schemaValidation: "invalid",
        providerAttempts: 1,
      },
    });
  },
);

test("invalid uploads and disabled generation include safe zero-attempt diagnostics", async () => {
  const s = await setup({ provider, onGenerationEvent: () => {} });
  expect(await (await s.post("{")).json()).toMatchObject({
    diagnostics: {
      outcome: "validation_error",
      schemaValidation: "not_attempted",
      providerAttempts: 0,
      httpStatus: 400,
    },
  });
  const disabled = await setup({ onGenerationEvent: () => {} });
  expect(await (await disabled.post()).json()).toMatchObject({
    diagnostics: {
      outcome: "provider_error",
      providerAttempts: 0,
      transportCalls: 0,
      httpStatus: 503,
    },
  });
});

async function until(predicate: () => boolean) {
  for (let n = 0; n < 500; n++) {
    if (predicate()) return;
    await wait(2);
  }
  throw Error("condition did not settle");
}

test.each([false, true])(
  "terminal event observes actual delayed response delivery; disconnect=%s",
  async (disconnect) => {
    const events: any[] = [];
    const s = await setup({
      provider,
      onGenerationEvent: (e) => events.push(e),
    });
    let release: (() => void) | undefined;
    let prepared: any;
    s.server.prependListener("request", (req, res) => {
      if (req.url !== "/api/generate") return;
      const end = res.end.bind(res);
      res.end = ((chunk: string) => {
        prepared = JSON.parse(chunk);
        release = () => end(chunk);
        return res;
      }) as typeof res.end;
    });
    const req = httpRequest(s.base + "/api/generate", {
      method: "POST",
      headers: s.headers,
    });
    req.on("error", () => {});
    req.on("response", (res) => res.resume());
    req.end(JSON.stringify({ name: "Demo", prompt: "Hello" }));
    await until(() => !!release);
    expect(events).toHaveLength(1);
    await wait(25);
    if (disconnect) req.destroy();
    else release!();
    await until(() => events.length === 2);
    expect(events[1]).toMatchObject({
      event: "generation_finish",
      outcome: disconnect ? "cancelled" : "success",
      delivery: disconnect ? "disconnected" : "finished",
    });
    expect(events[1].durationMs).toBeGreaterThanOrEqual(
      prepared.diagnostics.durationMs + 20,
    );
    if (disconnect) release!();
    await wait(10);
    expect(events).toHaveLength(2);
  },
);

test("deadline on noncooperative provider is final and blocks overlapping work until settlement", async () => {
  const events: any[] = [];
  let release!: () => void;
  let signal!: AbortSignal;
  const s = await setup({
    timeoutMs: 20,
    totalTimeoutMs: 100,
    onGenerationEvent: (e) => events.push(e),
    provider: {
      ...provider,
      generate: async (_req, sig) => {
        signal = sig;
        await new Promise<void>((r) => {
          release = r;
        });
        return { text: fixture };
      },
    },
  });
  const response = await s.post();
  const body = await response.json();
  expect(body.diagnostics).toMatchObject({
    outcome: "timeout",
    providerAttempts: 1,
    schemaValidation: "not_attempted",
    httpStatus: 504,
  });
  expect(signal.aborted).toBe(true);
  expect((await s.post()).status).toBe(429);
  const first = JSON.stringify(events.slice(0, 2));
  release();
  await wait(20);
  expect(JSON.stringify(events.slice(0, 2))).toBe(first);
  expect(events.slice(0, 2)[1]).toMatchObject({
    outcome: "timeout",
    delivery: "finished",
  });
});

test("stalled Gemini response body times out, cancels reader, and counts exactly one transport", async () => {
  let cancelled = false;
  const events: any[] = [];
  const s = await setup({
    timeoutMs: 20,
    onGenerationEvent: (e) => events.push(e),
    provider: createGeminiProvider({
      contract: "m2c",
      apiKey: "synthetic-only",
      fetch: async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
        ),
    }),
  });
  const body = await (await s.post()).json();
  expect(body.diagnostics).toMatchObject({
    outcome: "timeout",
    providerAttempts: 1,
    transportCalls: 1,
    schemaValidation: "not_attempted",
  });
  expect(cancelled).toBe(true);
  expect(events).toHaveLength(2);
});

test("disconnect during upload emits one cancelled event with zero attempts", async () => {
  const events: any[] = [];
  const s = await setup({ provider, onGenerationEvent: (e) => events.push(e) });
  const req = httpRequest(s.base + "/api/generate", {
    method: "POST",
    headers: { ...s.headers, "Transfer-Encoding": "chunked" },
  });
  req.on("error", () => {});
  req.write("{");
  await until(() => events.length === 1);
  req.destroy();
  await until(() => events.length === 2);
  expect(events[1]).toMatchObject({
    outcome: "cancelled",
    delivery: "disconnected",
    providerAttempts: 0,
    transportCalls: 0,
    httpStatus: 499,
  });
});

test("late abort-ignoring transport response is disposed without changing final timeout", async () => {
  let release!: (response: Response) => void;
  let cancelled = false;
  const events: any[] = [];
  const s = await setup({
    timeoutMs: 15,
    onGenerationEvent: (e) => events.push(e),
    provider: createGeminiProvider({
      contract: "m2c",
      apiKey: "synthetic-only",
      fetch: () =>
        new Promise<Response>((r) => {
          release = r;
        }),
    }),
  });
  expect((await (await s.post()).json()).diagnostics.outcome).toBe("timeout");
  const snapshot = JSON.stringify(events);
  release(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    ),
  );
  await wait(20);
  expect(cancelled).toBe(true);
  expect(JSON.stringify(events)).toBe(snapshot);
});

test("default telemetry is allowlisted JSON and never reflects sensitive arbitrary inputs", async () => {
  const logs: string[] = [];
  const spy = vi.spyOn(console, "info").mockImplementation((value) => {
    logs.push(value);
  });
  try {
    const s = await setup({
      provider: {
        ...provider,
        generate: async () => {
          throw Object.assign(Error("sensitive-exception"), {
            body: "sensitive-body",
            apiKey: "sensitive-key",
          });
        },
      },
    });
    const response = await s.post(undefined, {
      "X-Arbitrary": "sensitive-header",
    });
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.diagnostics.outcome).toBe("provider_error");
    expect(logs).toHaveLength(2);
    const serialized = logs.join("\n");
    expect(serialized).not.toMatch(
      /sensitive-|sessionToken|prompt|headers|apiKey|model/,
    );
    expect(serialized).not.toContain(s.status.sessionToken);
    for (const line of logs) {
      const event = JSON.parse(line);
      if (event.event === "generation_start")
        expect(Object.keys(event).sort()).toEqual([
          "event",
          "requestId",
          "startedAt",
        ]);
      else {
        const { event: kind, delivery, ...diagnostics } = event;
        expect(kind).toBe("generation_finish");
        expect(delivery).toBe("finished");
        expect(generationDiagnosticsSchema.safeParse(diagnostics).success).toBe(
          true,
        );
      }
    }
  } finally {
    spy.mockRestore();
  }
});

test("throwing event callback cannot alter success or create duplicate terminal events", async () => {
  let events = 0;
  const s = await setup({
    provider,
    onGenerationEvent: () => {
      events++;
      throw Error("observer failure");
    },
  });
  expect((await s.post()).status).toBe(200);
  await wait(5);
  expect(events).toBe(2);
});

test("retry completion removes every server abort relay and backoff listener", async () => {
  let attempts = 0;
  const s = await setup({
    retryDelayMs: 1,
    onGenerationEvent: () => {},
    provider: {
      ...provider,
      generate: async () => {
        if (++attempts === 1) throw new ProviderError("NETWORK");
        return { text: fixture };
      },
    },
  });
  const signals = new Set<AbortSignal>();
  const original = AbortSignal.prototype.addEventListener;
  const spy = vi
    .spyOn(AbortSignal.prototype, "addEventListener")
    .mockImplementation(function (
      this: AbortSignal,
      ...args: Parameters<typeof original>
    ) {
      signals.add(this);
      return original.apply(this, args);
    });
  try {
    await new Promise<void>((resolve, reject) => {
      const req = httpRequest(
        s.base + "/api/generate",
        { method: "POST", headers: s.headers },
        (res) => {
          res.resume();
          res.on("end", resolve);
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify({ name: "Demo", prompt: "Hello" }));
    });
    await wait(5);
    expect(attempts).toBe(2);
    expect(signals.size).toBeGreaterThan(0);
    for (const signal of signals)
      expect(getEventListeners(signal, "abort")).toHaveLength(0);
  } finally {
    spy.mockRestore();
  }
});

test("total deadline bounds an unfinished upload without invoking provider", async () => {
  const events: any[] = [];
  const s = await setup({
    provider,
    totalTimeoutMs: 20,
    onGenerationEvent: (e) => events.push(e),
  });
  const result = await new Promise<any>((resolve, reject) => {
    const req = httpRequest(
      s.base + "/api/generate",
      {
        method: "POST",
        headers: { ...s.headers, "Transfer-Encoding": "chunked" },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve(JSON.parse(body)));
      },
    );
    req.on("error", reject);
    req.write("{");
  });
  expect(result.diagnostics).toMatchObject({
    outcome: "timeout",
    httpStatus: 504,
    providerAttempts: 0,
    transportCalls: 0,
  });
  expect(events[1]).toMatchObject({ outcome: "timeout", delivery: "finished" });
});

test.each(["active", "backoff"] as const)(
  "disconnect during %s work is cancelled once with no late retry/overwrite",
  async (phase) => {
    const events: any[] = [];
    let calls = 0;
    let signal!: AbortSignal;
    let release: (() => void) | undefined;
    const s = await setup({
      timeoutMs: 1000,
      retryDelayMs: 1000,
      onGenerationEvent: (e) => events.push(e),
      provider: {
        ...provider,
        generate: async (_req, sig) => {
          calls++;
          signal = sig;
          if (phase === "backoff") throw new ProviderError("NETWORK");
          await new Promise<void>((r) => {
            release = r;
          });
          return { text: fixture };
        },
      },
    });
    const req = httpRequest(s.base + "/api/generate", {
      method: "POST",
      headers: s.headers,
    });
    req.on("error", () => {});
    req.end(JSON.stringify({ name: "Demo", prompt: "Hello" }));
    await until(() => calls === 1);
    await wait(5);
    req.destroy();
    await until(() => events.length === 2);
    expect(events[1]).toMatchObject({
      outcome: "cancelled",
      delivery: "disconnected",
      providerAttempts: 1,
      httpStatus: 499,
    });
    expect(signal.aborted).toBe(true);
    const snapshot = JSON.stringify(events);
    release?.();
    await wait(20);
    expect(JSON.stringify(events)).toBe(snapshot);
    expect(calls).toBe(1);
  },
);

test.each([
  "not JSON",
  JSON.stringify({ candidates: [] }),
  JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }),
])(
  "invalid Gemini envelope is validation_error with one transport",
  async (raw) => {
    const s = await setup({
      onGenerationEvent: () => {},
      provider: createGeminiProvider({
        contract: "m2c",
        apiKey: "synthetic-only",
        fetch: async () => new Response(raw),
      }),
    });
    expect((await (await s.post()).json()).diagnostics).toMatchObject({
      outcome: "validation_error",
      schemaValidation: "invalid",
      providerAttempts: 1,
      transportCalls: 1,
      httpStatus: 502,
    });
  },
);

test("strict diagnostics reject extra data and every contract boundary", () => {
  const valid = {
    requestId: "29b81ea9-18ac-49ad-a90e-1e308a06c5ac",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    outcome: "success",
    schemaValidation: "valid",
    providerAttempts: 1,
    transportCalls: 0,
    httpStatus: 200,
  };
  expect(generationDiagnosticsSchema.safeParse(valid).success).toBe(true);
  for (const invalid of [
    { arbitrary: "secret" },
    { requestId: "caller" },
    { startedAt: "yesterday" },
    { finishedAt: "invalid" },
    { durationMs: -1 },
    { durationMs: 0.5 },
    { outcome: "unknown" },
    { schemaValidation: "unknown" },
    { providerAttempts: 3 },
    { transportCalls: 3 },
    { httpStatus: 99 },
    { providerStatus: 600 },
  ]) {
    expect(
      generationDiagnosticsSchema.safeParse({ ...valid, ...invalid }).success,
    ).toBe(false);
  }
});
