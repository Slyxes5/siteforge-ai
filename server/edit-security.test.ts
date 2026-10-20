import { afterEach, expect, test, vi } from "vitest";
import { request as httpRequest, type Server } from "node:http";
import { createGenerationServer } from "./generation-server";
import { createMockEditProvider } from "./edit-provider";
import { EDIT_LIMITS } from "../src/ai/edit-contract";
import { ProviderError } from "./provider-error";

const origin = "http://127.0.0.1:5178";
const request = {
  instruction: "Welcome",
  context: {
    name: "Demo",
    blocks: [{ id: "intro", type: "heading", text: "Before" }],
  },
};
const payload = {
  version: 1,
  operations: [
    { op: "update", blockId: "intro", changes: { text: "Welcome" } },
  ],
};
const owned: Server[] = [];
afterEach(async () => {
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
async function setup(
  options: Parameters<typeof createGenerationServer>[0] = {},
) {
  const server = createGenerationServer({
    onGenerationEvent: () => {},
    ...options,
  });
  owned.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  const base = `http://127.0.0.1:${address.port}`;
  const status = await (await fetch(base + "/api/edit/status")).json();
  return { server, base, token: status.sessionToken as string };
}
async function send(
  s: Awaited<ReturnType<typeof setup>>,
  body: unknown = request,
  headers: Record<string, string> = {},
  path = "/api/edit/propose",
  method = "POST",
) {
  return new Promise<Response>((resolve, reject) => {
    const req = httpRequest(
      s.base + path,
      {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "X-SiteForge-Session": s.token,
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), { status: res.statusCode }),
          ),
        );
      },
    );
    req.on("error", reject);
    req.end(
      typeof body === "string" || Buffer.isBuffer(body)
        ? body
        : JSON.stringify(body),
    );
  });
}

test.each([
  {},
  null,
  [],
  "{",
  { ...request, instruction: "   " },
  { ...request, instruction: "x".repeat(10001) },
  { ...request, projectId: "private" },
  { ...request, context: { ...request.context, revision: 9 } },
  {
    ...request,
    context: {
      ...request.context,
      blocks: [request.context.blocks[0], request.context.blocks[0]],
    },
  },
  {
    ...request,
    context: {
      ...request.context,
      blocks: [{ id: "intro", type: "script", text: "bad" }],
    },
  },
  {
    ...request,
    context: {
      ...request.context,
      blocks: [
        {
          id: "intro",
          type: "button",
          text: "Bad",
          href: "javascript:alert(1)",
        },
      ],
    },
  },
  {
    ...request,
    context: {
      ...request.context,
      blocks: [{ ...request.context.blocks[0], id: "x".repeat(201) }],
    },
  },
])(
  "rejects malformed or invalid projected context before provider dispatch (case %#)",
  async (body) => {
    const propose = vi.fn(async () => JSON.stringify(payload));
    const s = await setup({ editProvider: createMockEditProvider(propose) });
    const response = await send(s, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_REQUEST", message: "Invalid edit request." },
    });
    expect(propose).not.toHaveBeenCalled();
  },
);

test.each<Record<string, string>>([
  { Origin: "https://hostile.test" },
  { Origin: "" },
  { Host: "localhost:1" },
  { Host: "evil.test" },
  { "X-SiteForge-Session": "bad" },
  { "X-SiteForge-Session": "" },
  { "Sec-Fetch-Site": "cross-site" },
])("edit POST uses existing security checks (case %#)", async (headers) => {
  const propose = vi.fn(async () => JSON.stringify(payload));
  const s = await setup({ editProvider: createMockEditProvider(propose) });
  expect((await send(s, request, headers)).status).toBe(403);
  expect(propose).not.toHaveBeenCalled();
});

test.each(["/api/edit/status", "/api/edit/propose"])(
  "edit route rejects hostile Origin and Host: %s",
  async (path) => {
    const s = await setup();
    expect(
      (await send(s, "", { Origin: "https://hostile.test" }, path, "GET"))
        .status,
    ).toBe(403);
    expect(
      (await send(s, "", { Host: "hostile.test" }, path, "GET")).status,
    ).toBe(403);
  },
);

test("edit session token cannot be reused on another server", async () => {
  const first = await setup();
  const second = await setup({
    editProvider: createMockEditProvider(async () => JSON.stringify(payload)),
  });
  expect(
    (await send(second, request, { "X-SiteForge-Session": first.token }))
      .status,
  ).toBe(403);
});

test("disabled edit POST fails without enabling generation", async () => {
  const s = await setup();
  expect((await send(s)).status).toBe(503);
});

test("edit POST requires JSON content type", async () => {
  const s = await setup({ editProvider: createMockEditProvider() });
  expect(
    (await send(s, request, { "Content-Type": "text/plain" })).status,
  ).toBe(415);
});

test.each(["GET", "PUT", "DELETE"])(
  "edit proposal route rejects method %s",
  async (method) => {
    const s = await setup();
    expect((await send(s, "", {}, "/api/edit/propose", method)).status).toBe(
      405,
    );
  },
);

test("edit OPTIONS permits only the existing safe headers", async () => {
  const s = await setup();
  const response = await fetch(s.base + "/api/edit/propose", {
    method: "OPTIONS",
    headers: { Origin: origin },
  });
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  expect(response.headers.get("access-control-allow-methods")).toBe("POST");
  expect(response.headers.get("access-control-allow-headers")).toBe(
    "Content-Type, X-SiteForge-Session",
  );
  expect(
    (await fetch(s.base + "/api/edit/propose", { method: "OPTIONS" })).status,
  ).toBe(403);
});

test("edit upload size is bounded even with chunked transfer", async () => {
  const propose = vi.fn(async () => JSON.stringify(payload));
  const s = await setup({
    editProvider: createMockEditProvider(propose),
    editLimits: { requestBytes: 80 },
  });
  expect(
    (await send(s, "x".repeat(100), { "Transfer-Encoding": "chunked" })).status,
  ).toBe(413);
  expect(propose).not.toHaveBeenCalled();
});

test("edit context UTF-8 byte ceiling applies within the whole-request ceiling", async () => {
  const propose = vi.fn(async () => JSON.stringify(payload));
  const s = await setup({ editProvider: createMockEditProvider(propose) });
  const context = {
    name: "Demo",
    blocks: Array.from({ length: 5 }, (_, index) => ({
      id: `block-${index}`,
      type: "paragraph",
      text: "界".repeat(10000),
    })),
  };
  expect((await send(s, { instruction: "Rewrite", context })).status).toBe(400);
  expect(propose).not.toHaveBeenCalled();
});

test.each(["lowered", "default"])(
  "edit raw response ceiling rejects oversized output under the %s limit",
  async (kind) => {
    const raw = "界".repeat(45000);
    const s = await setup({
      editProvider: createMockEditProvider(async () => raw),
      editLimits: kind === "lowered" ? { responseBytes: 80 } : {},
    });
    expect((await send(s)).status).toBe(502);
  },
);

test("edit response ceiling includes the HTTP wrapper", async () => {
  const raw = JSON.stringify(payload);
  const s = await setup({
    editProvider: createMockEditProvider(async () => raw),
    editLimits: { responseBytes: Buffer.byteLength(raw) },
  });
  expect((await send(s)).status).toBe(502);
});

test.each([
  new ProviderError("HTTP", 429, 1),
  new ProviderError("NETWORK"),
  new ProviderError("HTTP", 503, 1),
])(
  "edit never retries retryable generation-provider errors (case %#)",
  async (error) => {
    const propose = vi.fn(async () => {
      throw error;
    });
    const s = await setup({
      editProvider: createMockEditProvider(propose),
      maxAttempts: 2,
    });
    expect((await send(s)).status).toBe(502);
    expect(propose).toHaveBeenCalledOnce();
  },
);

test("generation and editing share one rate-limit budget", async () => {
  const generation = vi.fn(async () => ({
    text: JSON.stringify({
      blocks: [{ id: "intro", type: "heading", text: "Welcome" }],
    }),
  }));
  const s = await setup({
    rateLimit: 1,
    editProvider: createMockEditProvider(async () => JSON.stringify(payload)),
    provider: { id: "mock", model: "fixture", generate: generation },
  });
  expect((await send(s)).status).toBe(200);
  expect(
    (await send(s, { name: "Demo", prompt: "Welcome" }, {}, "/api/generate"))
      .status,
  ).toBe(429);
  expect(generation).not.toHaveBeenCalled();
});

test("edit processing does not access localStorage", async () => {
  const storage = {
    getItem: vi.fn(() => {
      throw new Error("Forbidden storage read");
    }),
    setItem: vi.fn(() => {
      throw new Error("Forbidden storage write");
    }),
  };
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  try {
    const s = await setup({
      editProvider: createMockEditProvider(async () => JSON.stringify(payload)),
    });
    expect((await send(s)).status).toBe(200);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test.each([
  { timeoutMs: 0 },
  { timeoutMs: NaN },
  { timeoutMs: Infinity },
  { timeoutMs: EDIT_LIMITS.timeoutMs + 1 },
  { requestBytes: EDIT_LIMITS.requestBytes + 1 },
  { responseBytes: EDIT_LIMITS.responseBytes + 1 },
])(
  "edit options cannot widen or invalidate fixed ceilings (case %#)",
  (editLimits) => {
    expect(() => createGenerationServer({ editLimits })).toThrow(
      "Invalid edit limits.",
    );
  },
);

test("edit request rejects malformed UTF-8 instead of replacing bytes", async () => {
  const propose = vi.fn(async () => JSON.stringify(payload));
  const s = await setup({ editProvider: createMockEditProvider(propose) });
  const body = Buffer.concat([
    Buffer.from('{"instruction":"'),
    Buffer.from([0xc3, 0x28]),
    Buffer.from('","context":' + JSON.stringify(request.context) + "}"),
  ]);
  expect((await send(s, body)).status).toBe(400);
  expect(propose).not.toHaveBeenCalled();
});

test("disconnecting an incomplete edit upload releases admission without dispatching a provider", async () => {
  const propose = vi.fn(async () => JSON.stringify(payload));
  const s = await setup({ editProvider: createMockEditProvider(propose) });
  const uploaded = new Promise<import("node:http").IncomingMessage>((resolve) =>
    s.server.once("request", resolve),
  );
  const req = httpRequest(s.base + "/api/edit/propose", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-SiteForge-Session": s.token,
      "Transfer-Encoding": "chunked",
    },
  });
  req.on("error", () => {});
  try {
    req.write("{");
    const incoming = await uploaded;
    expect((await send(s)).status).toBe(429);
    expect(propose).not.toHaveBeenCalled();
    const aborted = new Promise<void>((resolve) =>
      incoming.once("aborted", resolve),
    );
    req.destroy();
    await aborted;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((await send(s)).status).toBe(200);
    expect(propose).toHaveBeenCalledOnce();
  } finally {
    req.destroy();
  }
});

test("the edit deadline includes incomplete request upload time", async () => {
  const propose = vi.fn(async () => JSON.stringify(payload));
  const s = await setup({
    editProvider: createMockEditProvider(propose),
    editLimits: { timeoutMs: 15 },
  });
  let req!: ReturnType<typeof httpRequest>;
  const response = new Promise<number>((resolve, reject) => {
    req = httpRequest(
      s.base + "/api/edit/propose",
      {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "X-SiteForge-Session": s.token,
          "Transfer-Encoding": "chunked",
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode!));
      },
    );
    req.on("error", reject);
    req.write("{");
  });
  try {
    expect(await response).toBe(504);
    expect(propose).not.toHaveBeenCalled();
  } finally {
    req.destroy();
  }
});
