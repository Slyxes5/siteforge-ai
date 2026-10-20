import { expect, test, vi } from "vitest";
import { createGeminiProvider } from "./gemini-provider";
import { generatedContentJsonSchema } from "../src/ai/generation-content";
import { websitePlanJsonSchema } from "../src/ai/website-plan";
test("invalid provider input is rejected before transport or budget notification", async () => {
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({
      candidates: [
        { finishReason: "STOP", content: { parts: [{ text: content }] } },
      ],
    }),
  );
  const onTransportCall = vi.fn();
  const provider = createGeminiProvider({
    apiKey: "synthetic-contract-only",
    fetch: transport,
  });
  await expect(
    provider.generate({ name: "Demo", prompt: "" }, signal(), {
      onTransportCall,
    }),
  ).rejects.toMatchObject({
    code: "REQUEST_CONTRACT",
    diagnostic: {
      stage: "provider_request",
      reason: "INVALID_PROVIDER_REQUEST",
    },
    retryable: false,
  });
  expect(transport).not.toHaveBeenCalled();
  expect(onTransportCall).not.toHaveBeenCalled();
});
test("HTTP error retains only allowlisted RPC status, never provider message/details", async () => {
  const provider = createGeminiProvider({
    apiKey: "synthetic-contract-only",
    fetch: async () =>
      Response.json(
        {
          error: {
            code: 400,
            status: "INVALID_ARGUMENT",
            message: "PRIVATE-MESSAGE",
            details: [{ PRIVATE: "PRIVATE" }],
          },
        },
        { status: 400 },
      ),
  });
  try {
    await provider.generate(input, signal());
    throw Error("Expected rejection");
  } catch (error) {
    expect(error).toMatchObject({
      code: "HTTP",
      status: 400,
      rpcStatus: "INVALID_ARGUMENT",
      httpDiagnostics: {
        providerStatus: 400,
        providerRpcStatus: "INVALID_ARGUMENT",
      },
    });
    expect(JSON.stringify(error)).not.toContain("PRIVATE");
  }
});
const input = { name: "Demo", prompt: "Create a site" };
const content = JSON.stringify({
  blocks: [{ id: "hello", type: "heading", text: "Hello" }],
});
const signal = () => new AbortController().signal;
test.each([
  "../escape",
  "gemini-" + "x".repeat(94),
  "gemini?key=oops",
  "models/gemini",
  "gemini:generateContent",
  "",
])("rejects unsafe model ID %j without transport", (model) => {
  const transport = vi.fn<typeof fetch>();
  expect(() =>
    createGeminiProvider({
      apiKey: "unit-test-only-key",
      model,
      fetch: transport,
    }),
  ).toThrow();
  expect(transport).not.toHaveBeenCalled();
});
test.each([401, 403, 429, 500])(
  "classifies HTTP %i with no raw details",
  async (status) => {
    const provider = createGeminiProvider({
      apiKey: "unit-test-only-key",
      fetch: async () =>
        new Response("raw-private-body unit-test-only-key", {
          status,
          headers: { "Retry-After": "2" },
        }),
    });
    await expect(provider.generate(input, signal())).rejects.toMatchObject({
      code: "HTTP",
      status,
      retryAfterMs: 2000,
    });
    await expect(provider.generate(input, signal())).rejects.not.toThrow(
      /raw-private-body|unit-test-only-key/,
    );
  },
);
test("classifies network failure without reflecting error message", async () => {
  const provider = createGeminiProvider({
    apiKey: "unit-test-only-key",
    fetch: async () => {
      throw Error("unit-test-only-key");
    },
  });
  await expect(provider.generate(input, signal())).rejects.toMatchObject({
    code: "NETWORK",
  });
});
test.each([
  { promptFeedback: { blockReason: "SAFETY" } },
  { candidates: [{ finishReason: "SAFETY" }] },
  {
    candidates: [
      { finishReason: "MAX_TOKENS", content: { parts: [{ text: content }] } },
    ],
  },
  { candidates: [{ finishReason: "STOP", content: { parts: [] } }] },
  {
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ functionCall: { name: "execute" } }] },
      },
    ],
  },
])(
  "rejects refused, truncated or missing-text provider output",
  async (body) => {
    const provider = createGeminiProvider({
      apiKey: "unit-test-only-key",
      fetch: async () => Response.json(body),
    });
    await expect(provider.generate(input, signal())).rejects.toThrow();
  },
);
test("rejects invalid provider envelope JSON", async () => {
  const provider = createGeminiProvider({
    apiKey: "unit-test-only-key",
    fetch: async () => new Response("not JSON"),
  });
  await expect(provider.generate(input, signal())).rejects.toMatchObject({
    code: "INVALID_OUTPUT",
  });
});
test("bounds streamed provider body without Content-Length", async () => {
  const provider = createGeminiProvider({
    apiKey: "unit-test-only-key",
    responseBytes: 20,
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode("x".repeat(21)));
            c.close();
          },
        }),
      ),
  });
  await expect(provider.generate(input, signal())).rejects.toMatchObject({
    code: "TOO_LARGE",
  });
});
test("cancellation never calls transport", async () => {
  const transport = vi.fn<typeof fetch>();
  const controller = new AbortController();
  controller.abort();
  const provider = createGeminiProvider({
    apiKey: "unit-test-only-key",
    fetch: transport,
  });
  await expect(provider.generate(input, controller.signal)).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
});
test.each([
  { thoughtSignature: "synthetic-opaque-signature" },
  {
    partMetadata: {
      source: "PRIVATE-SYNTHETIC-SOURCE",
      arbitrary: { nested: true },
    },
  },
])(
  "accepts documented Part metadata without exposing it as content: %j",
  async (metadata) => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: content, ...metadata }] },
          },
        ],
      }),
    );
    const provider = createGeminiProvider({
      apiKey: "synthetic-test-only",
      fetch: transport,
    });
    await expect(provider.generate(input, signal())).resolves.toEqual({
      text: content,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  },
);
const envelope = (text = content) => ({
  candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }],
});
test("Gemini uses fixed official endpoint, header-only key and structured output without tools", async () => {
  const transport = vi.fn<typeof fetch>(async () => Response.json(envelope()));
  const provider = createGeminiProvider({
    apiKey: "unit-test-only-key",
    fetch: transport,
  });
  expect(await provider.generate(input, signal())).toEqual({ text: content });
  expect(transport).toHaveBeenCalledTimes(1);
  const [url, init] = transport.mock.calls[0];
  expect(url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
  );
  expect(url).not.toContain("unit-test-only-key");
  expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(
    "unit-test-only-key",
  );
  const body = JSON.parse(init!.body as string);
  expect(body.generationConfig).toEqual({
    responseMimeType: "application/json",
    responseJsonSchema: websitePlanJsonSchema,
    maxOutputTokens: 4096,
  });
  expect(body.tools).toBeUndefined();
  expect(body.systemInstruction.parts[0].text).toMatch(/placeholder/i);
  expect(init?.redirect).toBe("error");
});
