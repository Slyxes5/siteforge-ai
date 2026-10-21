import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterEditProvider } from "./openrouter-edit-provider";
import { OPENROUTER_EDIT_MODEL } from "./openrouter-edit-request";
import { createStructuredEditProposal } from "../src/ai/structured-edit";
import { sampleProject } from "../src/project-schema/project";

const key = "synthetic-edit-test-credential";
const input = {
  instruction: "Ubah judul menjadi Selamat Datang.",
  context: {
    name: "Demo",
    blocks: [{ id: "intro", type: "heading" as const, text: "Before" }],
  },
};
const operations = {
  version: 1,
  operations: [
    { op: "update", blockId: "intro", changes: { text: "Selamat Datang" } },
  ],
};
const envelope = (content: unknown = operations) => ({
  model: OPENROUTER_EDIT_MODEL,
  usage: { cost: 0 },
  choices: [
    {
      finish_reason: "stop",
      message: { role: "assistant", content: JSON.stringify(content) },
    },
  ],
});
const fetchResponse = (data: unknown = envelope()) =>
  vi.fn<typeof fetch>().mockResolvedValue(Response.json(data));
const signal = () => new AbortController().signal;
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("dormant OpenRouter editing adapter", () => {
  it("requires an explicit transport and never defaults to global fetch", () => {
    const ambient = vi.spyOn(globalThis, "fetch");
    expect(() =>
      createOpenRouterEditProvider({ apiKey: key } as never),
    ).toThrow();
    expect(ambient).not.toHaveBeenCalled();
  });

  it("makes one fixed-endpoint POST and returns only validated operations", async () => {
    const fetcher = fetchResponse();
    const provider = createOpenRouterEditProvider({
      apiKey: key,
      fetch: fetcher,
    });
    expect(provider.id).toBe("openrouter-edit");
    await expect(provider.propose(input, signal())).resolves.toBe(
      JSON.stringify(operations),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    });
    expect(new Headers(init!.headers).get("Authorization")).toBe(
      `Bearer ${key}`,
    );
    expect(init!.body).not.toContain(key);
    expect(input.context.blocks[0].text).toBe("Before");
  });

  it.each([
    { apiKey: "" },
    { apiKey: "bad\r\nheader" },
    { apiKey: "space key" },
    { model: "openrouter/free" },
    { timeoutMs: 0 },
    { timeoutMs: 45_001 },
    { timeoutMs: NaN },
    { responseBytes: 0 },
    { responseBytes: 131_073 },
  ])("rejects unsafe configuration (%#)", (override) => {
    const fetcher = fetchResponse();
    expect(() =>
      createOpenRouterEditProvider({
        apiKey: key,
        fetch: fetcher,
        ...override,
      }),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects oversized/invalid requests without dispatch", async () => {
    const fetcher = fetchResponse();
    const provider = createOpenRouterEditProvider({
      apiKey: key,
      fetch: fetcher,
    });
    await expect(
      provider.propose({ ...input, tools: [] } as never, signal()),
    ).rejects.toMatchObject({ code: "REQUEST_CONTRACT" });
    await expect(
      provider.propose(
        {
          ...input,
          context: {
            ...input.context,
            blocks: [{ ...input.context.blocks[0], text: "界".repeat(10_000) }],
          },
        },
        signal(),
      ),
    ).rejects.toMatchObject({ code: "REQUEST_CONTRACT" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([400, 401, 402, 429, 500, 503])(
    "sanitizes HTTP %i without retry/fallback",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(key, { status }));
      const error = await createOpenRouterEditProvider({
        apiKey: key,
        fetch: fetcher,
      })
        .propose(input, signal())
        .catch((e) => e);
      expect(error).toMatchObject({ code: "HTTP", status });
      expect(String(error) + JSON.stringify(error)).not.toContain(key);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["network", "body"])("sanitizes %s failure", async (kind) => {
    const fetcher =
      kind === "network"
        ? vi
            .fn<typeof fetch>()
            .mockRejectedValue(new Error(key + input.instruction))
        : vi.fn<typeof fetch>().mockResolvedValue(
            new Response(
              new ReadableStream({
                start(c) {
                  c.error(new Error(key));
                },
              }),
              { headers: { "Content-Type": "application/json" } },
            ),
          );
    const error = await createOpenRouterEditProvider({
      apiKey: key,
      fetch: fetcher,
    })
      .propose(input, signal())
      .catch((e) => e);
    expect(error).toMatchObject({ code: "NETWORK" });
    expect(String(error) + JSON.stringify(error)).not.toContain(key);
    expect(String(error)).not.toContain(input.instruction);
  });

  const invalidEnvelopes = [
    {},
    { ...envelope(), error: { message: key } },
    { ...envelope(), model: "other/model" },
    { ...envelope(), usage: { cost: 0.01 } },
    { ...envelope(), usage: { cost: "0" } },
    { ...envelope(), usage: null },
    { ...envelope(), choices: [] },
    { ...envelope(), choices: [envelope().choices[0], envelope().choices[0]] },
    {
      ...envelope(),
      choices: [{ ...envelope().choices[0], error: { message: key } }],
    },
    {
      ...envelope(),
      choices: [{ ...envelope().choices[0], finish_reason: "length" }],
    },
    {
      ...envelope(),
      choices: [{ ...envelope().choices[0], finish_reason: "tool_calls" }],
    },
    {
      ...envelope(),
      choices: [
        { finish_reason: "stop", message: { role: "user", content: "{}" } },
      ],
    },
    {
      ...envelope(),
      choices: [
        {
          finish_reason: "stop",
          message: { ...envelope().choices[0].message, tool_calls: [] },
        },
      ],
    },
    {
      ...envelope(),
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: "```json\n{}\n```" },
        },
      ],
    },
  ];
  it.each(invalidEnvelopes)("rejects untrusted envelope (%#)", async (data) => {
    await expect(
      createOpenRouterEditProvider({
        apiKey: key,
        fetch: fetchResponse(data),
      }).propose(input, signal()),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });

  it.each([
    envelope({ refusal: true }),
    {
      ...envelope(),
      choices: [{ ...envelope().choices[0], finish_reason: "content_filter" }],
    },
    {
      ...envelope(),
      choices: [
        {
          finish_reason: "stop",
          message: { ...envelope().choices[0].message, refusal: "refused" },
        },
      ],
    },
  ])(
    "classifies refusals without publishing provider text (%#)",
    async (data) => {
      await expect(
        createOpenRouterEditProvider({
          apiKey: key,
          fetch: fetchResponse(data),
        }).propose(input, signal()),
      ).rejects.toMatchObject({ code: "REFUSAL" });
    },
  );

  it("accepts only the exact pinned model or its unsuffixed response name", async () => {
    const data = { ...envelope(), model: OPENROUTER_EDIT_MODEL.slice(0, -5) };
    await expect(
      createOpenRouterEditProvider({
        apiKey: key,
        fetch: fetchResponse(data),
      }).propose(input, signal()),
    ).resolves.toBe(JSON.stringify(operations));
  });

  it.each([
    { ...operations, projectId: "forged" },
    { version: 1, operations: [] },
    {
      version: 1,
      operations: [
        { op: "update", blockId: "missing", changes: { text: "x" } },
      ],
    },
    {
      version: 1,
      operations: [
        { op: "update", blockId: "intro", changes: { id: "forged" } },
      ],
    },
    {
      version: 1,
      operations: [
        {
          op: "update",
          blockId: "intro",
          changes: { href: "javascript:alert(1)" },
        },
      ],
    },
    {
      version: 1,
      operations: [{ op: "update", blockId: "intro", changes: { text: 7 } }],
    },
    {
      version: 1,
      operations: [
        {
          op: "add",
          afterId: "intro",
          block: { type: "button", text: "Visit", href: "javascript:alert(1)" },
        },
      ],
    },
    {
      version: 1,
      operations: [
        {
          op: "add",
          afterId: "intro",
          block: { id: "forged", type: "paragraph", text: "x" },
        },
      ],
    },
    {
      version: 1,
      operations: [
        {
          op: "add",
          afterId: "missing",
          block: { type: "paragraph", text: "x" },
        },
      ],
    },
    { version: 1, operations: [{ op: "remove", blockId: "missing" }] },
    {
      version: 1,
      operations: [{ op: "reorder", blockIds: ["intro", "intro"] }],
    },
    {
      version: 1,
      operations: [
        { op: "remove", blockId: "intro" },
        { op: "update", blockId: "intro", changes: { text: "x" } },
      ],
    },
  ])("rejects invalid operations and references (%#)", async (data) => {
    await expect(
      createOpenRouterEditProvider({
        apiKey: key,
        fetch: fetchResponse(envelope(data)),
      }).propose(input, signal()),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });

  it("preserves host-owned IDs and leaves the canonical document untouched", async () => {
    const project = structuredClone(sampleProject);
    const before = structuredClone(project);
    const content = {
      version: 1,
      operations: [
        {
          op: "add",
          afterId: project.blocks[0].id,
          block: { type: "paragraph", text: "Selamat Datang" },
        },
      ],
    };
    const provider = createOpenRouterEditProvider({
      apiKey: key,
      fetch: fetchResponse(envelope(content)),
    });
    const proposal = await createStructuredEditProposal(
      project,
      "Tambahkan paragraf Selamat Datang.",
      provider,
      signal(),
    );
    expect(proposal.projectId).toBe(project.id);
    expect(proposal.baseRevision).toBe(project.revision);
    expect(proposal.operations[0]).toMatchObject({
      op: "add",
      block: { id: expect.any(String), text: "Selamat Datang" },
    });
    expect(project).toEqual(before);
  });

  it("accepts sequential removal, reordering and updates without changing context", async () => {
    const request = {
      ...input,
      context: {
        ...input.context,
        blocks: [
          ...input.context.blocks,
          { id: "second", type: "paragraph" as const, text: "Second" },
          { id: "third", type: "paragraph" as const, text: "Third" },
        ],
      },
    };
    const content = {
      version: 1,
      operations: [
        { op: "remove", blockId: "second" },
        { op: "reorder", blockIds: ["third", "intro"] },
        { op: "update", blockId: "intro", changes: { text: "Selamat Datang" } },
      ],
    };
    const before = structuredClone(request);
    await expect(
      createOpenRouterEditProvider({
        apiKey: key,
        fetch: fetchResponse(envelope(content)),
      }).propose(request, signal()),
    ).resolves.toBe(JSON.stringify(content));
    expect(request).toEqual(before);
  });

  it("leaves business-fact grounding authoritative in the host", async () => {
    const project = structuredClone(sampleProject);
    const before = structuredClone(project);
    const content = {
      version: 1,
      operations: [
        {
          op: "update",
          blockId: project.blocks[0].id,
          changes: { text: "Harga Rp 900000" },
        },
      ],
    };
    const provider = createOpenRouterEditProvider({
      apiKey: key,
      fetch: fetchResponse(envelope(content)),
    });
    await expect(
      createStructuredEditProposal(
        project,
        "Ubah judul menjadi penawaran spesial.",
        provider,
        signal(),
      ),
    ).rejects.toThrow("UNSUPPORTED_BUSINESS_FACT");
    expect(project).toEqual(before);
  });

  it("decodes multibyte UTF-8 split across stream chunks", async () => {
    const content = {
      version: 1,
      operations: [
        {
          op: "update",
          blockId: "intro",
          changes: { text: "Selamat Datang ☕" },
        },
      ],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(envelope(content)));
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
          controller.close();
        },
      }),
      { headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(
      createOpenRouterEditProvider({ apiKey: key, fetch: fetcher }).propose(
        input,
        signal(),
      ),
    ).resolves.toBe(JSON.stringify(content));
  });

  it.each(["declared", "actual"])(
    "rejects oversized %s response",
    async (kind) => {
      const response = new Response("x".repeat(513), {
        headers: {
          "Content-Type": "application/json",
          ...(kind === "declared" ? { "Content-Length": "513" } : {}),
        },
      });
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(
        createOpenRouterEditProvider({
          apiKey: key,
          fetch: fetcher,
          responseBytes: 512,
        }).propose(input, signal()),
      ).rejects.toMatchObject({ code: "TOO_LARGE" });
    },
  );

  it.each([
    new Response("{}", { headers: { "Content-Type": "text/html" } }),
    new Response("{}", {
      headers: { "Content-Type": "application/json", "Content-Length": "-1" },
    }),
    new Response(new Uint8Array([0xff]), {
      headers: { "Content-Type": "application/json" },
    }),
    Response.json("not an envelope"),
  ])("rejects malformed transport content (%#)", async (response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(
      createOpenRouterEditProvider({ apiKey: key, fetch: fetcher }).propose(
        input,
        signal(),
      ),
    ).rejects.toBeDefined();
  });

  it("does not dispatch an already cancelled request or reflect its reason", async () => {
    const controller = new AbortController();
    controller.abort(new Error(key));
    const fetcher = fetchResponse();
    const error = await createOpenRouterEditProvider({
      apiKey: key,
      fetch: fetcher,
    })
      .propose(input, controller.signal)
      .catch((e) => e);
    expect(error).toMatchObject({ name: "AbortError" });
    expect(String(error)).not.toContain(key);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["timeout", "caller"])(
    "bounds noncooperative fetch on %s and discards a late response",
    async (kind) => {
      vi.useFakeTimers();
      let resolve!: (response: Response) => void;
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      );
      const controller = new AbortController();
      const result = createOpenRouterEditProvider({
        apiKey: key,
        fetch: fetcher,
        timeoutMs: 20,
      })
        .propose(input, controller.signal)
        .catch((e) => e);
      if (kind === "caller") controller.abort(new Error(key));
      await vi.advanceTimersByTimeAsync(21);
      expect(await result).toMatchObject({
        name: kind === "caller" ? "AbortError" : "TimeoutError",
      });
      expect(vi.getTimerCount()).toBe(0);
      const cancel = vi.fn();
      resolve(
        new Response(new ReadableStream({ cancel }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("bounds a stalled body even when cancellation never settles", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new ReadableStream({ cancel }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = createOpenRouterEditProvider({
      apiKey: key,
      fetch: fetcher,
      timeoutMs: 20,
    })
      .propose(input, signal())
      .catch((e) => e);
    await vi.advanceTimersByTimeAsync(21);
    expect(await result).toMatchObject({ name: "TimeoutError" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
