import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterProvider } from "./openrouter-provider";
import { OPENROUTER_FREE_MODEL } from "./openrouter-request";
const input = { name: "Test", prompt: "A page" };
const key = "synthetic-openrouter-secret";
const envelope = (patch = {}) => ({
  model: OPENROUTER_FREE_MODEL,
  choices: [
    {
      message: { role: "assistant", content: '{"blocks":[]}' },
      finish_reason: "stop",
    },
  ],
  ...patch,
});
const response = (data: unknown) => new Response(JSON.stringify(data));
afterEach(() => vi.useRealTimers());
describe("OpenRouter provider", () => {
  it("rejects an HTTP200 choice-level error even with plausible text", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response(
        envelope({
          choices: [{ ...envelope().choices[0], error: { message: key } }],
        }),
      ),
    );
    await expect(
      createOpenRouterProvider({ apiKey: key, fetch: fetcher }).generate(
        input,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });
  it("rejects malformed UTF8 instead of accepting replacement characters in content", async () => {
    const prefix = new TextEncoder().encode(
      '{"choices":[{"finish_reason":"stop","message":{"role":"assistant","content":"',
    );
    const suffix = new TextEncoder().encode('"}}]}');
    const bytes = new Uint8Array([...prefix, 0xff, ...suffix]);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(bytes));
    await expect(
      createOpenRouterProvider({ apiKey: key, fetch: fetcher }).generate(
        input,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });
  it("does not await a noncooperative stream cancellation", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const result = createOpenRouterProvider({
      apiKey: key,
      fetch: fetcher,
      timeoutMs: 10,
    })
      .generate(input, new AbortController().signal)
      .catch((e) => e);
    await vi.advanceTimersByTimeAsync(11);
    expect(await result).toMatchObject({ name: "TimeoutError" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("native schema HTTP400 makes exactly one call without downgraded resubmission", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("sensitive provider error", { status: 400 }),
      );
    await expect(
      createOpenRouterProvider({
        apiKey: key,
        fetch: fetcher,
        outputMode: "json-schema",
      }).generate(input, new AbortController().signal),
    ).rejects.toMatchObject({ code: "HTTP", status: 400 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({
      response_format: { type: "json_schema" },
      provider: { require_parameters: true },
    });
  });
  it("sanitizes a body stream failure", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.error(new Error(key));
          },
        }),
      ),
    );
    const error = await createOpenRouterProvider({
      apiKey: key,
      fetch: fetcher,
    })
      .generate(input, new AbortController().signal)
      .catch((e) => e);
    expect(error).toMatchObject({ code: "NETWORK" });
    expect(JSON.stringify(error) + String(error)).not.toContain(key);
  });
  it("sanitizes network rejection and never retries", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(key + input.prompt));
    const onProviderStatus = vi.fn();
    const error = await createOpenRouterProvider({
      apiKey: key,
      fetch: fetcher,
    })
      .generate(input, new AbortController().signal, { onProviderStatus })
      .catch((e) => e);
    expect(error).toMatchObject({ code: "NETWORK" });
    expect(String(error) + JSON.stringify(error)).not.toContain(key);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onProviderStatus).not.toHaveBeenCalled();
  });
  it("rejects original invalid input before transport callbacks", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const onTransportCall = vi.fn();
    await expect(
      createOpenRouterProvider({ apiKey: key, fetch: fetcher }).generate(
        { ...input, tools: [] } as never,
        new AbortController().signal,
        { onTransportCall },
      ),
    ).rejects.toMatchObject({ code: "REQUEST_CONTRACT" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(onTransportCall).not.toHaveBeenCalled();
  });
  it.each([
    { apiKey: " " },
    { apiKey: "bad\r\nheader" },
    { apiKey: key, model: "openrouter/free" },
    { apiKey: key, timeoutMs: 0 },
    { apiKey: key, timeoutMs: Infinity },
    { apiKey: key, responseBytes: -1 },
  ])("rejects unsafe construction %j", (options) => {
    expect(() => createOpenRouterProvider(options)).toThrow();
  });
  it("does not let status observer exceptions affect generation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(envelope()));
    await expect(
      createOpenRouterProvider({ apiKey: key, fetch: fetcher }).generate(
        input,
        new AbortController().signal,
        {
          onProviderStatus: () => {
            throw new Error(key);
          },
        },
      ),
    ).resolves.toEqual({ text: '{"blocks":[]}' });
  });
  it("keeps transport budget callback immediately before fetch and honors budget rejection", async () => {
    const order: string[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      order.push("fetch");
      return response(envelope());
    });
    await createOpenRouterProvider({ apiKey: key, fetch: fetcher }).generate(
      input,
      new AbortController().signal,
      {
        onTransportCall: () => {
          order.push("budget");
        },
      },
    );
    expect(order).toEqual(["budget", "fetch"]);
    const blocked = vi.fn<typeof fetch>();
    await expect(
      createOpenRouterProvider({ apiKey: key, fetch: blocked }).generate(
        input,
        new AbortController().signal,
        {
          onTransportCall: () => {
            throw new Error("budget blocked");
          },
        },
      ),
    ).rejects.toBeDefined();
    expect(blocked).not.toHaveBeenCalled();
  });
  it("propagates preexisting caller abort without transport", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);
    const fetcher = vi.fn<typeof fetch>();
    const onTransportCall = vi.fn();
    await expect(
      createOpenRouterProvider({ apiKey: key, fetch: fetcher }).generate(
        input,
        controller.signal,
        { onTransportCall },
      ),
    ).rejects.toBe(reason);
    expect(fetcher).not.toHaveBeenCalled();
    expect(onTransportCall).not.toHaveBeenCalled();
  });
  it.each(["deadline", "caller"])(
    "bounds noncooperative fetch on %s and cancels late response",
    async (mode) => {
      vi.useFakeTimers();
      let resolve!: (r: Response) => void;
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      );
      const controller = new AbortController();
      const reason = new Error("caller abort");
      const onProviderStatus = vi.fn();
      const result = createOpenRouterProvider({
        apiKey: key,
        fetch: fetcher,
        timeoutMs: 25,
      })
        .generate(input, controller.signal, { onProviderStatus })
        .catch((e) => e);
      if (mode === "caller") controller.abort(reason);
      await vi.advanceTimersByTimeAsync(26);
      const error = await result;
      if (mode === "caller") expect(error).toBe(reason);
      else
        expect(error).toMatchObject({
          name: "TimeoutError",
          message: "Provider deadline exceeded.",
        });
      expect((fetcher.mock.calls[0][1]!.signal as AbortSignal).aborted).toBe(
        true,
      );
      const cancel = vi.fn();
      resolve(new Response(new ReadableStream({ cancel })));
      await vi.advanceTimersByTimeAsync(0);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(onProviderStatus).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it.each(["deadline", "caller"])(
    "bounds stalled body on %s and cancels the reader",
    async (mode) => {
      vi.useFakeTimers();
      const cancel = vi.fn();
      const controller = new AbortController();
      const reason = new Error("cancel body");
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(new ReadableStream({ cancel })));
      const onProviderStatus = vi.fn();
      const result = createOpenRouterProvider({
        apiKey: key,
        fetch: fetcher,
        timeoutMs: 25,
      })
        .generate(input, controller.signal, { onProviderStatus })
        .catch((e) => e);
      await vi.advanceTimersByTimeAsync(0);
      if (mode === "caller") controller.abort(reason);
      await vi.advanceTimersByTimeAsync(26);
      const error = await result;
      if (mode === "caller") expect(error).toBe(reason);
      else expect(error).toMatchObject({ name: "TimeoutError" });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(onProviderStatus.mock.calls).toEqual([[200]]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it.each(["declared", "stream"])(
    "bounds %s bytes and cancels unread content",
    async (mode) => {
      const cancel = vi.fn();
      const body = new ReadableStream({
        start(c) {
          if (mode === "stream")
            c.enqueue(new TextEncoder().encode("x".repeat(101)));
        },
        cancel,
      });
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(body, {
          headers: mode === "declared" ? { "content-length": "101" } : {},
        }),
      );
      await expect(
        createOpenRouterProvider({
          apiKey: key,
          fetch: fetcher,
          responseBytes: 100,
          timeoutMs: 50,
        }).generate(input, new AbortController().signal),
      ).rejects.toMatchObject({ code: "TOO_LARGE" });
      expect(cancel).toHaveBeenCalledTimes(1);
    },
  );
  it("cleans successful deadline and caller listener", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(envelope()));
    await createOpenRouterProvider({ apiKey: key, fetch: fetcher }).generate(
      input,
      controller.signal,
    );
    expect(vi.getTimerCount()).toBe(0);
    expect(add).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
  });
  it.each([400, 401, 402, 403, 429, 503])(
    "discards HTTP %s without retry or raw body exposure",
    async (status) => {
      const cancel = vi.fn();
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(new ReadableStream({ cancel }), {
          status,
          headers: { "retry-after": "2" },
        }),
      );
      const onProviderStatus = vi.fn();
      const error = await createOpenRouterProvider({
        apiKey: key,
        fetch: fetcher,
      })
        .generate(input, new AbortController().signal, { onProviderStatus })
        .catch((e) => e);
      expect(error).toMatchObject({ code: "HTTP", status, retryAfterMs: 2000 });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(onProviderStatus.mock.calls).toEqual([[status]]);
      expect(JSON.stringify(error) + String(error)).not.toContain(key);
    },
  );
  it.each([
    [
      "truncation",
      {
        choices: [
          {
            finish_reason: "length",
            message: { role: "assistant", content: "partial" },
          },
        ],
      },
      "INVALID_OUTPUT",
      "OUTPUT_TRUNCATED",
    ],
    [
      "filter",
      { choices: [{ finish_reason: "content_filter" }] },
      "REFUSAL",
      "PROVIDER_REFUSAL",
    ],
    [
      "refusal",
      {
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "no",
              refusal: "sensitive refusal",
            },
          },
        ],
      },
      "REFUSAL",
      "PROVIDER_REFUSAL",
    ],
    [
      "tools",
      {
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "{}",
              tool_calls: [{ secret: key }],
            },
          },
        ],
      },
      "INVALID_OUTPUT",
      "UNSUPPORTED_PROVIDER_PART",
    ],
    [
      "function",
      {
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: "{}", function_call: {} },
          },
        ],
      },
      "INVALID_OUTPUT",
      "UNSUPPORTED_PROVIDER_PART",
    ],
    [
      "error",
      { error: { message: key } },
      "INVALID_OUTPUT",
      "INVALID_PROVIDER_ENVELOPE",
    ],
    [
      "no choices",
      { choices: [] },
      "INVALID_OUTPUT",
      "INVALID_PROVIDER_ENVELOPE",
    ],
    [
      "multiple",
      { choices: [envelope().choices[0], envelope().choices[0]] },
      "INVALID_OUTPUT",
      "INVALID_PROVIDER_ENVELOPE",
    ],
    [
      "wrong role",
      {
        choices: [
          { finish_reason: "stop", message: { role: "user", content: "{}" } },
        ],
      },
      "INVALID_OUTPUT",
      "INVALID_PROVIDER_ENVELOPE",
    ],
    [
      "non-string",
      {
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: [] },
          },
        ],
      },
      "INVALID_OUTPUT",
      "INVALID_PROVIDER_ENVELOPE",
    ],
    [
      "reasoning only",
      {
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", reasoning: "{}" },
          },
        ],
      },
      "INVALID_OUTPUT",
      "INVALID_PROVIDER_ENVELOPE",
    ],
    [
      "empty",
      {
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: "  " },
          },
        ],
      },
      "INVALID_OUTPUT",
      "EMPTY_CONTENT",
    ],
    [
      "unknown finish",
      {
        choices: [
          {
            finish_reason: "tool_calls",
            message: { role: "assistant", content: "{}" },
          },
        ],
      },
      "INVALID_OUTPUT",
      "PROVIDER_FINISH_REASON",
    ],
    [
      "wrong model",
      { model: "paid/other" },
      "INVALID_OUTPUT",
      "INVALID_PROVIDER_ENVELOPE",
    ],
    [
      "nonzero cost",
      { usage: { cost: 0.01 } },
      "INVALID_OUTPUT",
      "INVALID_PROVIDER_ENVELOPE",
    ],
  ])("rejects %s safely in one call", async (_name, patch, code, reason) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(envelope(patch as object)));
    const error = await createOpenRouterProvider({
      apiKey: key,
      fetch: fetcher,
    })
      .generate(input, new AbortController().signal)
      .catch((e) => e);
    expect(error).toMatchObject({ code, diagnostic: { reason } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error) + String(error)).not.toContain(key);
    expect(JSON.stringify(error)).not.toContain("sensitive refusal");
  });
  it.each(["not json", "", '{"choices":'])(
    "rejects malformed or empty envelopes %s",
    async (raw) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(raw));
      await expect(
        createOpenRouterProvider({ apiKey: key, fetch: fetcher }).generate(
          input,
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    },
  );
  it("accepts normalized base response model, ignoring reasoning metadata", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response(
        envelope({
          model: "nvidia/nemotron-3.5-super-vl",
          choices: [
            {
              finish_reason: "stop",
              message: { role: "assistant", content: "{}", reasoning: key },
            },
          ],
        }),
      ),
    );
    await expect(
      createOpenRouterProvider({ apiKey: key, fetch: fetcher }).generate(
        input,
        new AbortController().signal,
      ),
    ).resolves.toEqual({ text: "{}" });
  });
  it("sends one fixed authenticated POST and returns assistant content only", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response(envelope({ usage: { cost: 0 }, secretMetadata: "ignored" })),
      );
    const onTransportCall = vi.fn();
    const onProviderStatus = vi.fn();
    const provider = createOpenRouterProvider({ apiKey: key, fetch: fetcher });
    expect(provider).toMatchObject({
      id: "openrouter",
      outputFormat: "website-plan-v1",
      attemptPolicy: "single",
      model: OPENROUTER_FREE_MODEL,
    });
    await expect(
      provider.generate(input, new AbortController().signal, {
        onTransportCall,
        onProviderStatus,
      }),
    ).resolves.toEqual({ text: '{"blocks":[]}' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    });
    expect(String(url) + init?.body).not.toContain(key);
    expect(JSON.parse(init!.body as string)).toMatchObject({
      model: OPENROUTER_FREE_MODEL,
      stream: false,
      max_tokens: 8192,
    });
    expect(onTransportCall).toHaveBeenCalledTimes(1);
    expect(onProviderStatus.mock.calls).toEqual([[200]]);
  });
});
