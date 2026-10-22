import { describe, it, expect, vi } from "vitest";
import { generateWebsite } from "./generation-client";
import { buildCandidate } from "./generation-content";
import { GENERATION_LIMITS } from "./website-generation";
const input = { name: "Studio", prompt: "A local studio" };
const provider = { id: "mock" as const, model: "fixture" };
const candidate = buildCandidate(
  JSON.stringify({
    blocks: [{ id: "heading", type: "heading", text: "Hello" }],
  }),
  input,
  provider,
  "new-id",
);
const diagnostics = {
  requestId: "11111111-1111-4111-8111-111111111111",
  startedAt: "2026-10-19T00:00:00.000Z",
  finishedAt: "2026-10-19T00:00:00.010Z",
  durationMs: 10,
  outcome: "success" as const,
  schemaValidation: "valid" as const,
  providerAttempts: 1,
  transportCalls: 1,
  httpStatus: 200,
};
const status = {
  mode: "mock",
  model: "fixture",
  sessionToken: "test-session-token-with-enough-length",
};
function transport(
  result: unknown = { candidate, mode: "mock" },
  mode = "mock",
) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...status, mode })))
    .mockResolvedValueOnce(new Response(JSON.stringify(result)));
}
describe("same-origin generation client", () => {
  it("waits beyond the OpenRouter provider deadline for its receipt, then enforces the client ceiling", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json(status))
        .mockImplementationOnce(() => new Promise(() => {}));
      let settled = false;
      const pending = generateWebsite(
        input,
        new AbortController().signal,
        fetcher,
      )
        .catch((error) => error)
        .finally(() => {
          settled = true;
        });
      await vi.advanceTimersByTimeAsync(125001);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(
        GENERATION_LIMITS.clientTimeoutMs - 125000,
      );
      expect(await pending).toMatchObject({ outcome: "timeout" });
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retains bounded provider timings from a timeout receipt", async () => {
    const receipt = {
      ...diagnostics,
      outcome: "timeout",
      schemaValidation: "not_attempted",
      httpStatus: 504,
      providerStatus: 200,
      providerTimings: { headersMs: 10, firstByteMs: 50 },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(status))
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: "PRIVATE" }, diagnostics: receipt },
          { status: 504 },
        ),
      );
    await expect(
      generateWebsite(input, new AbortController().signal, fetcher),
    ).rejects.toMatchObject({ outcome: "timeout", diagnostics: receipt });
  });
  it.each([
    [400, "invalid_request", false],
    [429, "rate_limit_or_quota", true],
    [503, "provider_failure", true],
  ])(
    "retains safe provider HTTP %i classification without retrying",
    async (providerStatus, providerErrorCategory, providerRetryable) => {
      const receipt = {
        ...diagnostics,
        outcome: "provider_error",
        schemaValidation: "not_attempted",
        httpStatus: 502,
        providerStatus,
        providerErrorCategory,
        providerRetryable,
      };
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(Response.json(status))
        .mockResolvedValueOnce(
          Response.json(
            { error: { message: "PRIVATE-BODY" }, diagnostics: receipt },
            { status: 502 },
          ),
        );
      await expect(
        generateWebsite(input, new AbortController().signal, fetch),
      ).rejects.toMatchObject({ diagnostics: receipt });
      expect(fetch).toHaveBeenCalledTimes(2); // One local status GET and one POST, no retry.
    },
  );
  it.each([
    { providerErrorCategory: "PRIVATE" },
    { providerRpcStatus: "PRIVATE" },
    { providerRpcStatus: "INVALID_ARGUMENT", providerStatus: undefined },
    { providerErrorCategory: "authorization" },
    { providerRetryable: true },
  ])(
    "drops inconsistent or non-allowlisted provider HTTP diagnostics",
    async (invalid) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(Response.json(status))
        .mockResolvedValueOnce(
          Response.json(
            {
              error: { message: "PRIVATE-BODY" },
              diagnostics: {
                ...diagnostics,
                outcome: "provider_error",
                schemaValidation: "not_attempted",
                httpStatus: 502,
                providerStatus: 400,
                providerErrorCategory: "invalid_request",
                providerRetryable: false,
                ...invalid,
              },
            },
            { status: 502 },
          ),
        );
      const failure = await generateWebsite(
        input,
        new AbortController().signal,
        fetch,
      ).catch((error) => error);
      expect(failure.diagnostics).toBeUndefined();
      expect(failure.message).not.toContain("PRIVATE");
    },
  );
  it("checks generated business facts against the actual request, not a forged description", async () => {
    const forged = buildCandidate(
      JSON.stringify({
        blocks: [
          {
            id: "contact",
            type: "contact",
            text: "Contact",
            body: "",
            email: "invented@example.test",
            phone: "",
            address: "",
          },
        ],
      }),
      { name: "Studio", prompt: "Email invented@example.test" },
      provider,
      "fresh",
    );
    await expect(
      generateWebsite(
        input,
        new AbortController().signal,
        transport({ candidate: forged, mode: "mock" }),
      ),
    ).rejects.toThrow();
  });
  it("accepts safe backend diagnostics with a validated success candidate", async () => {
    const value = await generateWebsite(
      input,
      new AbortController().signal,
      transport({ candidate, mode: "mock", diagnostics }),
    );
    expect(value.diagnostics).toEqual(diagnostics);
  });
  it("classifies sanitized server validation failure without reflecting its raw error message", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(status)))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "INVALID_OUTPUT", message: "PRIVATE-ERROR" },
            diagnostics: {
              ...diagnostics,
              outcome: "validation_error",
              schemaValidation: "invalid",
              httpStatus: 502,
            },
          }),
          { status: 502 },
        ),
      );
    const error = await generateWebsite(
      input,
      new AbortController().signal,
      fetch,
    ).catch((error) => error);
    expect(error).toMatchObject({
      outcome: "validation_error",
      diagnostics: { requestId: diagnostics.requestId },
    });
    expect(error.message).not.toContain("PRIVATE-ERROR");
  });
  it("times out an uncooperative status transport without ever posting generation", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => {}));
    const pending = generateWebsite(
      input,
      new AbortController().signal,
      fetch,
      { timeoutMs: 15 },
    ).catch((error) => error);
    const marker = Symbol("pending");
    const outcome = await Promise.race([
      pending,
      new Promise((resolve) => setTimeout(() => resolve(marker), 60)),
    ]);
    expect(outcome).not.toBe(marker);
    expect(outcome).toMatchObject({ outcome: "timeout" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("settles cancellation while reading a response body whose source never finishes", async () => {
    let finish!: () => void;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        finish = () => {
          try {
            controller.close();
          } catch {}
        };
      },
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(status)))
      .mockResolvedValueOnce(new Response(stream));
    const controller = new AbortController();
    const pending = generateWebsite(input, controller.signal, fetch).catch(
      (error) => error,
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    controller.abort();
    const marker = Symbol("still pending");
    const outcome = await Promise.race([
      pending,
      new Promise((resolve) => setTimeout(() => resolve(marker), 40)),
    ]);
    finish();
    await pending;
    expect(outcome).not.toBe(marker);
    expect(outcome).toMatchObject({ outcome: "cancelled" });
  });
  it("sends only name/prompt and session token, validates a returned candidate", async () => {
    const fetch = transport();
    expect(
      await generateWebsite(input, new AbortController().signal, fetch),
    ).toEqual({ candidate, mode: "mock" });
    expect(fetch.mock.calls[1][0]).toBe("/api/generate");
    expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toEqual(input);
    expect(fetch.mock.calls[1][1]!.headers).toEqual({
      "Content-Type": "application/json",
      "X-SiteForge-Session": status.sessionToken,
    });
  });
  it("fails closed when disabled without posting generation", async () => {
    const fetch = transport(undefined, "disabled");
    await expect(
      generateWebsite(input, new AbortController().signal, fetch),
    ).rejects.toThrow("disabled");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects externally loaded image content before preview", async () => {
    const unsafe = {
      ...candidate,
      blocks: [
        {
          id: "image",
          type: "image",
          src: "https://tracker.test/pixel",
          alt: "",
          text: "",
        },
      ],
    };
    await expect(
      generateWebsite(
        input,
        new AbortController().signal,
        transport({ candidate: unsafe, mode: "mock" }),
      ),
    ).rejects.toThrow();
  });
  it("does not echo errors or retry backend rate limits", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(status)))
      .mockResolvedValueOnce(
        new Response("sensitive-provider-body", { status: 429 }),
      );
    await expect(
      generateWebsite(input, new AbortController().signal, fetch),
    ).rejects.toThrow("rate limit");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rejects malformed response and aborts even if a transport ignores cancellation", async () => {
    await expect(
      generateWebsite(
        input,
        new AbortController().signal,
        transport({ candidate: "invalid", mode: "mock" }),
      ),
    ).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(
      generateWebsite(input, controller.signal, transport()),
    ).rejects.toThrow();
  });
});
