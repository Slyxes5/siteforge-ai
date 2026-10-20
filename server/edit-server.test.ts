import { afterEach, expect, test, vi } from "vitest";
import { request as httpRequest, type Server } from "node:http";
import { createStructuredEditProposal } from "../src/ai/structured-edit";
import { previewEditProposal, projectSnapshot } from "../src/ai/edit-proposal";
import { createMockEditProvider } from "./edit-provider";
import { sampleProject } from "../src/project-schema/project";
import { createGenerationServer } from "./generation-server";

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
    throw new Error("Missing test address");
  const base = `http://127.0.0.1:${address.port}`;
  return { server, base };
}

test("edit status is independently disabled by default with a fresh session token", async () => {
  const first = await setup();
  const second = await setup();
  const response = await fetch(first.base + "/api/edit/status");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  const status = await response.json();
  expect(status).toEqual({
    mode: "disabled",
    provider: null,
    sessionToken: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  const other = await (await fetch(second.base + "/api/edit/status")).json();
  expect(other.sessionToken).not.toBe(status.sessionToken);
});

const input = () => ({
  instruction: "Make the heading welcoming",
  context: {
    name: sampleProject.name,
    blocks: structuredClone(sampleProject.blocks),
  },
});
const payload = {
  version: 1,
  operations: [
    { op: "update", blockId: "hero-heading", changes: { text: "Welcome" } },
  ],
};
async function post(
  s: Awaited<ReturnType<typeof setup>>,
  body: unknown = input(),
  headers: Record<string, string> = {},
) {
  const status = await (await fetch(s.base + "/api/edit/status")).json();
  return fetch(s.base + "/api/edit/propose", {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:5178",
      "Content-Type": "application/json",
      "X-SiteForge-Session": status.sessionToken,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("synthetic edit returns operations only without applying a project or creating proposal metadata", async () => {
  let calls = 0;
  const provider = createMockEditProvider(async (request, signal) => {
    calls++;
    expect(signal.aborted).toBe(false);
    expect(request).toEqual(input());
    return JSON.stringify(payload);
  });
  const s = await setup({ editProvider: provider });
  const status = await (await fetch(s.base + "/api/edit/status")).json();
  expect(status).toMatchObject({ mode: "mock", provider: "synthetic" });
  const before = input();
  const response = await post(s, before);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ mode: "mock", response: payload });
  expect(before).toEqual(input());
  expect(calls).toBe(1);
  expect(
    await (await fetch(s.base + "/api/generation/status")).json(),
  ).toMatchObject({ mode: "disabled" });
});

test.each([
  { op: "update", blockId: "no-longer-present", changes: { text: "Welcome" } },
  { op: "remove", blockId: "no-longer-present" },
  {
    op: "add",
    afterId: "no-longer-present",
    block: { type: "paragraph", text: "Welcome" },
  },
  { op: "update", blockId: "hero-heading", changes: { text: 42 } },
  { op: "update", blockId: "hero-heading", changes: { tone: "dark" } },
  { op: "reorder", blockIds: ["hero-heading", "hero-heading"] },
  { op: "reorder", blockIds: ["hero-heading"] },
])(
  "rejects operations incompatible with the supplied context (case %#)",
  async (operation) => {
    let calls = 0;
    const s = await setup({
      editProvider: createMockEditProvider(async () => {
        calls++;
        return JSON.stringify({ version: 1, operations: [operation] });
      }),
    });
    const response = await post(s);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_OUTPUT",
        message: "Provider returned invalid edit operations.",
      },
    });
    expect(calls).toBe(1);
  },
);

test("edit deadline aborts an uncooperative provider without accepting its late output or retrying", async () => {
  let signal!: AbortSignal;
  let calls = 0;
  const s = await setup({
    editLimits: { timeoutMs: 15 },
    editProvider: createMockEditProvider(async (_request, current) => {
      signal = current;
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 80));
      return JSON.stringify(payload);
    }),
  });
  const response = await post(s);
  expect(response.status).toBe(504);
  expect(await response.json()).toEqual({
    error: { code: "TIMEOUT", message: "Editing timed out." },
  });
  expect(signal.aborted).toBe(true);
  expect(calls).toBe(1);
  expect((await post(s)).status).toBe(429);
  await new Promise((resolve) => setTimeout(resolve, 100));
});

test("provider exceptions return edit-specific sanitized errors without retries", async () => {
  let calls = 0;
  const s = await setup({
    maxAttempts: 2,
    editProvider: createMockEditProvider(async () => {
      calls++;
      throw new Error("secret-key private-context raw-body");
    }),
  });
  const response = await post(s);
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    error: { code: "PROVIDER_ERROR", message: "Editing failed." },
  });
  expect(calls).toBe(1);
});

test("elapsed edit deadlines take precedence over a synchronous late provider failure", async () => {
  let signal!: AbortSignal;
  const s = await setup({
    editLimits: { timeoutMs: 5 },
    editProvider: createMockEditProvider(async (_request, current) => {
      signal = current;
      const until = performance.now() + 20;
      while (performance.now() < until) {}
      throw new Error("Late private error");
    }),
  });
  expect((await post(s)).status).toBe(504);
  expect(signal.aborted).toBe(true);
});

test("Stage 1 refuses a live-labelled backend edit provider at runtime", () => {
  const editProvider = {
    id: "openrouter",
    propose: vi.fn(async () => JSON.stringify(payload)),
  };
  expect(() =>
    createGenerationServer({
      editProvider: editProvider as unknown as ReturnType<
        typeof createMockEditProvider
      >,
    }),
  ).toThrow("Only synthetic edit providers are supported.");
  expect(editProvider.propose).not.toHaveBeenCalled();
});

test("edit status is GET-only", async () => {
  const s = await setup();
  expect(
    (await fetch(s.base + "/api/edit/status", { method: "POST" })).status,
  ).toBe(405);
});

test.each(["/api/edit/status", "/api/edit/propose"])(
  "edit route rejects a non-loopback peer even with a permitted Host: %s",
  async (path) => {
    const s = await setup({ editProvider: createMockEditProvider() });
    s.server.on("connection", (socket) =>
      Object.defineProperty(socket, "remoteAddress", { value: "192.0.2.10" }),
    );
    expect((await fetch(s.base + path)).status).toBe(403);
  },
);

test.each([
  "",
  "{",
  "null",
  "[]",
  "```json\n{}\n```",
  JSON.stringify({ ...payload, projectId: "private" }),
  JSON.stringify({ ...payload, baseSnapshot: "fake" }),
  JSON.stringify({ ...payload, mode: "live" }),
  JSON.stringify({ version: 2, operations: payload.operations }),
  JSON.stringify({ version: 1, operations: [] }),
  JSON.stringify({ version: 1, operations: [{ op: "save" }] }),
  JSON.stringify({
    version: 1,
    operations: [
      { op: "update", blockId: "hero-heading", changes: { id: "owned" } },
    ],
  }),
  JSON.stringify({
    version: 1,
    operations: [
      {
        op: "add",
        afterId: null,
        block: { id: "owned", type: "heading", text: "Welcome" },
      },
    ],
  }),
  '{"version":1,"operations":[{"op":"update","blockId":"hero-heading","changes":{"__proto__":{"polluted":true}}}]}',
])(
  "rejects untrusted invalid edit envelopes without retries (case %#)",
  async (raw) => {
    const propose = vi.fn(async () => raw);
    const s = await setup({ editProvider: createMockEditProvider(propose) });
    const response = await post(s);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_OUTPUT",
        message: "Provider returned invalid edit operations.",
      },
    });
    expect(propose).toHaveBeenCalledOnce();
    expect(Object.prototype).not.toHaveProperty("polluted");
  },
);

test.each(
  [
    [{ op: "remove", blockId: "hero-copy" }],
    [{ op: "reorder", blockIds: ["hero-copy", "hero-heading"] }],
    [
      {
        op: "add",
        afterId: "hero-heading",
        block: { type: "paragraph", text: "New paragraph" },
      },
    ],
    [
      { op: "update", blockId: "hero-heading", changes: { text: "Welcome" } },
      { op: "remove", blockId: "hero-copy" },
    ],
  ].map((operations) => ({ operations })),
)(
  "returns valid operation sequences unchanged and without new IDs (case %#)",
  async ({ operations }) => {
    const responsePayload = { version: 1, operations };
    const s = await setup({
      editProvider: createMockEditProvider(async () =>
        JSON.stringify(responsePayload),
      ),
    });
    const response = await post(s);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mode: "mock",
      response: responsePayload,
    });
  },
);

test("accepts add then remove at the 200-block replacement boundary", async () => {
  const request = {
    instruction: "Replace the first heading with a paragraph",
    context: {
      name: "Demo",
      blocks: Array.from({ length: 200 }, (_, index) => ({
        id: `heading-${index}`,
        type: "heading",
        text: "Before",
      })),
    },
  };
  const responsePayload = {
    version: 1,
    operations: [
      {
        op: "add",
        afterId: null,
        block: { type: "paragraph", text: "Replacement" },
      },
      { op: "remove", blockId: "heading-0" },
    ],
  };
  const s = await setup({
    editProvider: createMockEditProvider(async () =>
      JSON.stringify(responsePayload),
    ),
  });
  const response = await post(s, request);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    mode: "mock",
    response: responsePayload,
  });
});

test("rejects an edit whose final block count exceeds 200", async () => {
  const s = await setup({
    editProvider: createMockEditProvider(async () =>
      JSON.stringify({
        version: 1,
        operations: [
          {
            op: "add",
            afterId: null,
            block: { type: "paragraph", text: "Overflow" },
          },
        ],
      }),
    ),
  });
  const response = await post(s, {
    instruction: "Add a paragraph",
    context: {
      name: "Demo",
      blocks: Array.from({ length: 200 }, (_, index) => ({
        id: `heading-${index}`,
        type: "heading",
        text: "Before",
      })),
    },
  });
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    error: {
      code: "INVALID_OUTPUT",
      message: "Provider returned invalid edit operations.",
    },
  });
});

test("provider context mutation cannot change the baseline used for backend target checks", async () => {
  const s = await setup({
    editProvider: createMockEditProvider(async (request) => {
      request.context.blocks[0].id = "invented";
      return JSON.stringify({
        version: 1,
        operations: [{ op: "remove", blockId: "invented" }],
      });
    }),
  });
  expect((await post(s)).status).toBe(502);
});

test("the preserved host boundary rejects stale drafts after a real synthetic HTTP round trip", async () => {
  const s = await setup({
    editProvider: createMockEditProvider(async () => JSON.stringify(payload)),
  });
  const project = structuredClone(sampleProject);
  const before = projectSnapshot(project);
  const proposal = await createStructuredEditProposal(
    project,
    "Make the heading welcoming",
    {
      id: "synthetic-http-test",
      async propose(request, signal) {
        signal.throwIfAborted();
        const response = await post(s, request);
        expect(response.status).toBe(200);
        return JSON.stringify((await response.json()).response);
      },
    },
    new AbortController().signal,
  );
  expect(projectSnapshot(project)).toBe(before);
  expect(proposal.baseSnapshot).toBe(before);
  project.blocks[0].text = "New unsaved manual edit";
  expect(() => previewEditProposal(project, proposal)).toThrow(
    /stale|baseline/i,
  );
  expect(project.blocks[0].text).toBe("New unsaved manual edit");
});

test("client disconnect cancels editing and retains shared admission until the provider settles", async () => {
  let signal!: AbortSignal;
  let finish!: (value: string) => void;
  let started!: () => void;
  const called = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const s = await setup({
    editProvider: createMockEditProvider((_request, current) => {
      signal = current;
      started();
      return pending;
    }),
  });
  const status = await (await fetch(s.base + "/api/edit/status")).json();
  const req = httpRequest(s.base + "/api/edit/propose", {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:5178",
      "Content-Type": "application/json",
      "X-SiteForge-Session": status.sessionToken,
    },
  });
  req.on("error", () => {});
  req.end(JSON.stringify(input()));
  await called;
  req.destroy();
  await vi.waitFor(() => expect(signal.aborted).toBe(true));
  expect((await post(s)).status).toBe(429);
  finish(JSON.stringify(payload));
  await pending;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect((await post(s)).status).toBe(200);
});

test("editing and generation share a concurrency lock in both directions", async () => {
  let finishEdit!: (value: string) => void;
  let finishGeneration!: (value: { text: string }) => void;
  let editStarted!: () => void;
  let generationStarted!: () => void;
  const editReady = new Promise<void>((resolve) => {
    editStarted = resolve;
  });
  const generationReady = new Promise<void>((resolve) => {
    generationStarted = resolve;
  });
  const s = await setup({
    editProvider: createMockEditProvider(() => {
      editStarted();
      return new Promise<string>((resolve) => {
        finishEdit = resolve;
      });
    }),
    provider: {
      id: "mock",
      model: "fixture",
      generate: () => {
        generationStarted();
        return new Promise((resolve) => {
          finishGeneration = resolve;
        });
      },
    },
  });
  const token = (await (await fetch(s.base + "/api/edit/status")).json())
    .sessionToken;
  const generate = () =>
    fetch(s.base + "/api/generate", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:5178",
        "Content-Type": "application/json",
        "X-SiteForge-Session": token,
      },
      body: JSON.stringify({ name: "Demo", prompt: "Welcome" }),
    });
  const edit = post(s);
  await editReady;
  expect((await generate()).status).toBe(429);
  finishEdit(JSON.stringify(payload));
  expect((await edit).status).toBe(200);
  const generation = generate();
  await generationReady;
  expect((await post(s)).status).toBe(429);
  finishGeneration({
    text: JSON.stringify({
      blocks: [{ id: "intro", type: "heading", text: "Welcome" }],
    }),
  });
  expect((await generation).status).toBe(200);
});
