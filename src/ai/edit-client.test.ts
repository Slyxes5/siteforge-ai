import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpEditProvider, EditClientFailure } from "./edit-client";
import { EDIT_LIMITS } from "./edit-contract";
import type { EditProviderRequest } from "./structured-edit";

const input: EditProviderRequest = {
  instruction: "Replace the heading with Welcome",
  context: {
    name: "Studio",
    blocks: [{ id: "heading", type: "heading", text: "Hello" }],
  },
};
const status = {
  mode: "mock",
  provider: "synthetic",
  sessionToken: "a1".repeat(32),
};
const response = {
  version: 1,
  operations: [
    { op: "update", blockId: "heading", changes: { text: "Welcome" } },
  ],
};
const result = { mode: "mock", response };
const json = (value: unknown) => Response.json(value);
function transport() {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json(status))
    .mockResolvedValueOnce(json(result));
}
const signal = () => new AbortController().signal;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected global network access");
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("same-origin structured edit HTTP provider", () => {
  it.each([
    { ...input, instruction: " " },
    { ...input, instruction: "x".repeat(10_001) },
    { ...input, projectId: "not-allowed" },
    { ...input, context: { ...input.context, revision: 4 } },
    {
      ...input,
      context: {
        name: "Studio",
        blocks: [{ id: "x", type: "heading", text: "x", secret: "no" }],
      },
    },
    {
      ...input,
      context: {
        name: "Studio",
        blocks: Array.from({ length: 7 }, (_, i) => ({
          id: String(i),
          type: "paragraph",
          text: "😀".repeat(5000),
        })),
      },
    },
  ])(
    "rejects malformed or UTF-8-oversized requests before fetching %#",
    async (invalid) => {
      const fetch = transport();
      await expect(
        createHttpEditProvider(fetch).propose(
          invalid as EditProviderRequest,
          signal(),
        ),
      ).rejects.toMatchObject({
        name: "EditClientFailure",
        outcome: "validation_error",
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...status, mode: "live" },
    { ...status, provider: "gemini" },
    { ...status, model: "private" },
    { ...status, sessionToken: "A".repeat(64) },
    { ...status, sessionToken: "a".repeat(63) },
    { ...status, sessionToken: "a".repeat(65) },
    { ...status, sessionToken: "g".repeat(64) },
    { mode: "mock", provider: "synthetic" },
    {
      mode: "disabled",
      provider: "synthetic",
      sessionToken: status.sessionToken,
    },
  ])(
    "strictly rejects unknown status or malformed session metadata before POST %#",
    async (invalid) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(json(invalid));
      await expect(
        createHttpEditProvider(fetch).propose(input, signal()),
      ).rejects.toMatchObject({ outcome: "validation_error" });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("does not POST when the strictly validated capability is disabled", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
      json({
        mode: "disabled",
        provider: null,
        sessionToken: status.sessionToken,
      }),
    );
    await expect(
      createHttpEditProvider(fetch).propose(input, signal()),
    ).rejects.toMatchObject({ outcome: "disabled" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["status", "POST"])(
    "sanitizes unavailable %s errors without retry",
    async (stage) => {
      for (const unavailable of [
        new Response("PRIVATE-BODY", { status: 503 }),
        new Error("PRIVATE-TRANSPORT"),
      ]) {
        const fetch = vi.fn<typeof globalThis.fetch>();
        if (stage === "POST") fetch.mockResolvedValueOnce(json(status));
        if (unavailable instanceof Error)
          fetch.mockRejectedValueOnce(unavailable);
        else fetch.mockResolvedValueOnce(unavailable);
        const failure = await createHttpEditProvider(fetch)
          .propose(input, signal())
          .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(EditClientFailure);
        expect(failure).toMatchObject({
          outcome: "provider_error",
          message: "Edit backend unavailable.",
        });
        expect(fetch).toHaveBeenCalledTimes(stage === "POST" ? 2 : 1);
      }
    },
  );
  it.each([
    { ...result, mode: "live" },
    { ...result, diagnostics: { private: true } },
    { ...result, response: { ...response, proposalId: "host-only" } },
    { ...result, response: { ...response, version: 2 } },
    { ...result, response: { version: 1, operations: [] } },
    { ...result, response: { version: 1, operations: [{ op: "save" }] } },
    {
      ...result,
      response: {
        version: 1,
        operations: [
          {
            op: "add",
            afterId: null,
            block: { id: "forged", type: "heading", text: "No" },
          },
        ],
      },
    },
  ])(
    "rejects invalid operation envelopes and host-owned metadata %#",
    async (invalid) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(json(status))
        .mockResolvedValueOnce(json(invalid));
      await expect(
        createHttpEditProvider(fetch).propose(input, signal()),
      ).rejects.toMatchObject({ outcome: "validation_error" });
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it.each(["status", "POST"])(
    "bounds and strictly decodes every %s body",
    async (stage) => {
      const encoded = new TextEncoder().encode(
        JSON.stringify(stage === "status" ? status : result),
      );
      const invalidUtf8 = new Uint8Array([
        ...encoded.slice(0, encoded.length - 1),
        0xff,
      ]);
      const cases = [
        new Response("PRIVATE-NOT-JSON", {
          headers: { "Content-Type": "application/json" },
        }),
        new Response(JSON.stringify(stage === "status" ? status : result), {
          headers: { "Content-Type": "text/plain" },
        }),
        new Response(invalidUtf8, {
          headers: { "Content-Type": "application/json" },
        }),
        new Response(null, { headers: { "Content-Type": "application/json" } }),
        new Response("{}", {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(EDIT_LIMITS.responseBytes + 1),
          },
        }),
        new Response("{}", {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": "not-a-size",
          },
        }),
        new Response("{}", {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": "-1",
          },
        }),
        new Response("{}", {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": "1.5",
          },
        }),
        new Response(" ".repeat(EDIT_LIMITS.responseBytes + 1), {
          headers: { "Content-Type": "application/json" },
        }),
        // Character count is below the limit, but encoded byte count is above it.
        new Response(
          JSON.stringify({
            mode: "mock",
            response: {
              version: 1,
              operations: [
                {
                  op: "update",
                  blockId: "heading",
                  changes: { text: "😀".repeat(40_000) },
                },
              ],
            },
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Content-Length": "1",
            },
          },
        ),
      ];
      for (const bad of cases) {
        const fetch = vi.fn<typeof globalThis.fetch>();
        if (stage === "POST") fetch.mockResolvedValueOnce(json(status));
        fetch.mockResolvedValueOnce(bad);
        const failure = await createHttpEditProvider(fetch)
          .propose(input, signal())
          .catch((error: unknown) => error);
        expect(failure).toMatchObject({
          outcome: "validation_error",
          message: "Invalid edit request or response.",
        });
        expect(fetch).toHaveBeenCalledTimes(stage === "POST" ? 2 : 1);
      }
    },
  );
  it("rejects invalid UTF-8 inside otherwise valid operation JSON instead of replacing bytes", async () => {
    const text = JSON.stringify(result);
    const index = text.indexOf("Welcome");
    const bytes = new TextEncoder().encode(text);
    bytes[index] = 0xff;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(status))
      .mockResolvedValueOnce(
        new Response(bytes, {
          headers: { "Content-Type": "application/json" },
        }),
      );
    await expect(
      createHttpEditProvider(fetch).propose(input, signal()),
    ).rejects.toMatchObject({ outcome: "validation_error" });
  });
  it("accepts an exact-byte-limit JSON envelope split across multibyte code points", async () => {
    const value = {
      mode: "mock",
      response: {
        ...response,
        operations: [
          { op: "update", blockId: "heading", changes: { text: "😀" } },
        ],
      },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const padded = new Uint8Array(EDIT_LIMITS.responseBytes).fill(32);
    padded.set(bytes);
    let position = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (position === padded.length) return controller.close();
        const end = Math.min(position + 7, padded.length);
        controller.enqueue(padded.slice(position, end));
        position = end;
      },
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(status))
      .mockResolvedValueOnce(
        new Response(stream, {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": String(padded.byteLength),
          },
        }),
      );
    await expect(
      createHttpEditProvider(fetch).propose(input, signal()),
    ).resolves.toBe(JSON.stringify(value.response));
  });
  it.each(["header", "stream", "HTTP"])(
    "cancels rejected %s bodies without awaiting noncooperative cancellation",
    async (kind) => {
      const cancel = vi.fn(() => new Promise<void>(() => {}));
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          if (kind === "stream")
            controller.enqueue(new Uint8Array(EDIT_LIMITS.responseBytes + 1));
        },
        cancel,
      });
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (kind === "header")
        headers["Content-Length"] = String(EDIT_LIMITS.responseBytes + 1);
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
        new Response(stream, {
          headers,
          status: kind === "HTTP" ? 503 : 200,
        }),
      );
      await expect(
        createHttpEditProvider(fetch).propose(input, signal()),
      ).rejects.toMatchObject({
        outcome: kind === "HTTP" ? "provider_error" : "validation_error",
      });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("does not fetch for a pre-cancelled caller or reflect its reason", async () => {
    const caller = new AbortController();
    caller.abort(new Error("PRIVATE-REASON"));
    const fetch = transport();
    await expect(
      createHttpEditProvider(fetch).propose(input, caller.signal),
    ).rejects.toMatchObject({
      outcome: "cancelled",
      message: "Edit request cancelled.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["status", "POST"])(
    "settles cancellation independently of noncooperative %s fetch",
    async (stage) => {
      const pending = deferred<Response>();
      const fetch = vi.fn<typeof globalThis.fetch>();
      if (stage === "POST") fetch.mockResolvedValueOnce(json(status));
      fetch.mockReturnValueOnce(pending.promise);
      const caller = new AbortController();
      const request = createHttpEditProvider(fetch).propose(
        input,
        caller.signal,
      );
      const checked = expect(request).rejects.toMatchObject({
        outcome: "cancelled",
        message: "Edit request cancelled.",
      });
      await flush();
      expect(fetch).toHaveBeenCalledTimes(stage === "POST" ? 2 : 1);
      caller.abort(new DOMException("PRIVATE-REASON", "TimeoutError"));
      await checked;
      expect(fetch.mock.calls.at(-1)![1]!.signal!.aborted).toBe(true);
      const cancel = vi.fn();
      pending.resolve(
        new Response(new ReadableStream({ cancel }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
      await flush();
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(stage === "POST" ? 2 : 1);
    },
  );
  it.each(["status", "POST"])(
    "times out noncooperative %s fetch and discards late results",
    async (stage) => {
      vi.useFakeTimers();
      const pending = deferred<Response>();
      const fetch = vi.fn<typeof globalThis.fetch>();
      if (stage === "POST") fetch.mockResolvedValueOnce(json(status));
      fetch.mockReturnValueOnce(pending.promise);
      const request = createHttpEditProvider(fetch, { timeoutMs: 20 }).propose(
        input,
        signal(),
      );
      const checked = expect(request).rejects.toMatchObject({
        outcome: "timeout",
      });
      await flush();
      await vi.advanceTimersByTimeAsync(20);
      await checked;
      const cancel = vi.fn();
      pending.resolve(
        new Response(new ReadableStream({ cancel }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
      await flush();
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(stage === "POST" ? 2 : 1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it.each(["status", "POST"])(
    "races cancellation and timeout against noncooperative %s body reads",
    async (stage) => {
      for (const outcome of ["timeout", "cancelled"] as const) {
        vi.useFakeTimers();
        const read = vi.fn(
          () => new Promise<ReadableStreamReadResult<Uint8Array>>(() => {}),
        );
        const cancel = vi.fn(() => new Promise<void>(() => {}));
        const releaseLock = vi.fn();
        const body = { getReader: () => ({ read, cancel, releaseLock }) };
        const hanging = {
          ok: true,
          headers: new Headers({ "Content-Type": "application/json" }),
          body,
        } as unknown as Response;
        const fetch = vi.fn<typeof globalThis.fetch>();
        if (stage === "POST") fetch.mockResolvedValueOnce(json(status));
        fetch.mockResolvedValueOnce(hanging);
        const caller = new AbortController();
        const request = createHttpEditProvider(fetch, {
          timeoutMs: 20,
        }).propose(input, caller.signal);
        const checked = expect(request).rejects.toMatchObject({ outcome });
        await flush();
        expect(read).toHaveBeenCalledTimes(1);
        if (outcome === "timeout") await vi.advanceTimersByTimeAsync(20);
        else caller.abort(new Error("PRIVATE"));
        await checked;
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(releaseLock).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledTimes(stage === "POST" ? 2 : 1);
        expect(vi.getTimerCount()).toBe(0);
        vi.useRealTimers();
      }
    },
  );
  it("keeps a single end-to-end deadline across status and POST", async () => {
    vi.useFakeTimers();
    const pending = deferred<Response>();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(pending.promise)
      .mockReturnValueOnce(new Promise<Response>(() => {}));
    const request = createHttpEditProvider(fetch, { timeoutMs: 30 }).propose(
      input,
      signal(),
    );
    const checked = expect(request).rejects.toMatchObject({
      outcome: "timeout",
    });
    await vi.advanceTimersByTimeAsync(20);
    pending.resolve(json(status));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10);
    await checked;
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([undefined, 90_000, Infinity, NaN, 0, -1])(
    "bounds timeout option %s to at most 45 seconds",
    async (timeoutMs) => {
      vi.useFakeTimers();
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockReturnValue(new Promise<Response>(() => {}));
      const request = createHttpEditProvider(fetch, { timeoutMs }).propose(
        input,
        signal(),
      );
      const checked = expect(request).rejects.toMatchObject({
        outcome: "timeout",
      });
      await vi.advanceTimersByTimeAsync(
        timeoutMs !== undefined && timeoutMs <= 0 ? 1 : EDIT_LIMITS.timeoutMs,
      );
      await checked;
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("removes caller and internal abort listeners and timer after success", async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const callerAdd = vi.spyOn(caller.signal, "addEventListener");
    const callerRemove = vi.spyOn(caller.signal, "removeEventListener");
    let internalAdd: ReturnType<typeof vi.spyOn> | undefined;
    let internalRemove: ReturnType<typeof vi.spyOn> | undefined;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(async (_url, init) => {
        internalAdd = vi.spyOn(init!.signal!, "addEventListener");
        internalRemove = vi.spyOn(init!.signal!, "removeEventListener");
        return json(status);
      })
      .mockResolvedValueOnce(json(result));
    await createHttpEditProvider(fetch).propose(input, caller.signal);
    for (const [event, listener] of callerAdd.mock.calls)
      expect(callerRemove).toHaveBeenCalledWith(event, listener);
    expect(callerAdd).toHaveBeenCalledTimes(1);
    expect(internalAdd!.mock.calls.length).toBeGreaterThan(0);
    for (const [event, listener] of internalAdd!.mock.calls)
      expect(internalRemove).toHaveBeenCalledWith(event, listener);
    expect(vi.getTimerCount()).toBe(0);
    caller.abort();
    expect(fetch.mock.calls[0][1]!.signal!.aborted).toBe(false);
  });
  it("cancels an obtained body when the caller aborts between fetch settlement and decoding", async () => {
    const caller = new AbortController();
    const pending = deferred<Response>();
    void pending.promise.then(() => {
      queueMicrotask(() => caller.abort());
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(pending.promise);
    const cancel = vi.fn();
    const request = createHttpEditProvider(fetch).propose(input, caller.signal);
    const checked = expect(request).rejects.toMatchObject({
      outcome: "cancelled",
    });
    pending.resolve(
      new Response(new ReadableStream({ cancel }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    await checked;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["status", "POST"])(
    "prioritizes elapsed deadline over synchronous %s success or failure",
    async (stage) => {
      for (const throws of [false, true]) {
        let now = 0;
        const clock = vi
          .spyOn(performance, "now")
          .mockImplementation(() => now);
        const cancel = vi.fn();
        const late = new Response(new ReadableStream({ cancel }), {
          headers: { "Content-Type": "application/json" },
        });
        const fetch = vi.fn<typeof globalThis.fetch>();
        if (stage === "POST") fetch.mockResolvedValueOnce(json(status));
        fetch.mockImplementationOnce(() => {
          now = 20;
          if (throws) throw new Error("PRIVATE-LATE-ERROR");
          return Promise.resolve(late);
        });
        await expect(
          createHttpEditProvider(fetch, { timeoutMs: 10 }).propose(
            input,
            signal(),
          ),
        ).rejects.toMatchObject({
          outcome: "timeout",
          message: "Edit request timed out.",
        });
        if (!throws) expect(cancel).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledTimes(stage === "POST" ? 2 : 1);
        clock.mockRestore();
      }
    },
  );
  it.each(["request", "decode", "parse", "serialize"])(
    "checks elapsed deadline around synchronous %s work",
    async (stage) => {
      let now = 0;
      vi.spyOn(performance, "now").mockImplementation(() => now);
      const fetch = transport();
      if (stage === "request") {
        const encode = TextEncoder.prototype.encode;
        vi.spyOn(TextEncoder.prototype, "encode").mockImplementation(function (
          this: TextEncoder,
          text,
        ) {
          const value = encode.call(this, text);
          now = 20;
          return value;
        });
      } else if (stage === "decode") {
        const decode = TextDecoder.prototype.decode;
        vi.spyOn(TextDecoder.prototype, "decode").mockImplementation(function (
          this: TextDecoder,
          bytes,
          options,
        ) {
          const value = decode.call(this, bytes, options);
          now = 20;
          return value;
        });
      } else if (stage === "parse") {
        const parse = JSON.parse;
        vi.spyOn(JSON, "parse").mockImplementation((text: string) => {
          const value: unknown = parse(text);
          if (text.includes('"operations"')) now = 20;
          return value;
        });
      } else {
        const stringify = JSON.stringify;
        vi.spyOn(JSON, "stringify").mockImplementation((value: unknown) => {
          const text = stringify(value);
          if (value && typeof value === "object" && "version" in value)
            now = 20;
          return text;
        });
      }
      await expect(
        createHttpEditProvider(fetch, { timeoutMs: 10 }).propose(
          input,
          signal(),
        ),
      ).rejects.toMatchObject({ outcome: "timeout" });
      expect(fetch).toHaveBeenCalledTimes(
        stage === "request" ? 0 : stage === "decode" ? 1 : 2,
      );
    },
  );
  it.each(["timeout", "cancelled"])(
    "ignores late fetch rejections after %s without retry or unhandled errors",
    async (outcome) => {
      vi.useFakeTimers();
      const pending = deferred<Response>();
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockReturnValueOnce(pending.promise);
      const caller = new AbortController();
      const request = createHttpEditProvider(fetch, { timeoutMs: 10 }).propose(
        input,
        caller.signal,
      );
      const checked = expect(request).rejects.toMatchObject({ outcome });
      if (outcome === "timeout") await vi.advanceTimersByTimeAsync(10);
      else caller.abort();
      await checked;
      pending.reject(new Error("PRIVATE-LATE-ERROR"));
      await flush();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("bounds cumulative stream bytes even when each chunk and advertised length are small", async () => {
    const cancel = vi.fn();
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(
          new Uint8Array(++chunks === 1 ? 65_536 : 65_537).fill(32),
        );
      },
      cancel,
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(status))
      .mockResolvedValueOnce(
        new Response(body, {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": "10",
          },
        }),
      );
    await expect(
      createHttpEditProvider(fetch).propose(input, signal()),
    ).rejects.toMatchObject({ outcome: "validation_error" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(["validation", "disabled", "HTTP", "cancelled", "timeout"])(
    "cleans up caller listeners and timers after %s failure",
    async (kind) => {
      vi.useFakeTimers();
      const caller = new AbortController();
      const add = vi.spyOn(caller.signal, "addEventListener");
      const remove = vi.spyOn(caller.signal, "removeEventListener");
      const fetch = vi.fn<typeof globalThis.fetch>();
      if (kind === "disabled")
        fetch.mockResolvedValueOnce(
          json({
            mode: "disabled",
            provider: null,
            sessionToken: status.sessionToken,
          }),
        );
      else if (kind === "HTTP")
        fetch.mockResolvedValueOnce(new Response("PRIVATE", { status: 500 }));
      else fetch.mockReturnValueOnce(new Promise<Response>(() => {}));
      const request = createHttpEditProvider(fetch, { timeoutMs: 10 }).propose(
        kind === "validation" ? { ...input, instruction: "" } : input,
        caller.signal,
      );
      const checked = expect(request).rejects.toBeInstanceOf(EditClientFailure);
      if (kind === "cancelled") caller.abort();
      if (kind === "timeout") await vi.advanceTimersByTimeAsync(10);
      await checked;
      expect(add).toHaveBeenCalledTimes(1);
      for (const [event, listener] of add.mock.calls)
        expect(remove).toHaveBeenCalledWith(event, listener);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("uses internally fixed messages for its exported failure API", () => {
    const failure = new EditClientFailure("provider_error");
    expect(failure).toBeInstanceOf(Error);
    expect(failure.outcome).toBe("provider_error");
    expect(failure.message).toBe("Edit backend unavailable.");
  });
  it("constructs without fetching and returns only untrusted operations over one status and one POST", async () => {
    const fetch = transport();
    const provider = createHttpEditProvider(fetch);
    expect(fetch).not.toHaveBeenCalled();
    expect(provider.id).toBe("synthetic");
    const before = structuredClone(input);
    expect(await provider.propose(input, signal())).toBe(
      JSON.stringify(response),
    );
    expect(input).toEqual(before);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]).toEqual([
      "/api/edit/status",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    ]);
    expect(fetch.mock.calls[1]).toEqual([
      "/api/edit/propose",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "X-SiteForge-Session": status.sessionToken,
        },
        body: JSON.stringify(input),
        signal: fetch.mock.calls[0][1]!.signal,
      }),
    ]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
