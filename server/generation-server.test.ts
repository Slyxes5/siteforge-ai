import { afterEach, expect, test } from "vitest";
import { request as httpRequest, type Server } from "node:http";
import { createGenerationServer } from "./generation-server";
import { ProviderError } from "./provider-error";
import type { WebsiteGenerationProvider } from "../src/ai/website-generation";
const fixture = JSON.stringify({
  blocks: [{ id: "intro", type: "heading", text: "Hello" }],
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
test("aborting an incomplete upload releases admission without calling provider", async () => {
  let calls = 0;
  const s = await setup({
    provider: {
      ...provider,
      generate: async () => {
        calls++;
        return { text: fixture };
      },
    },
  });
  const req = httpRequest(s.base + "/api/generate", {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:5178",
      "Content-Type": "application/json",
      "X-SiteForge-Session": s.data.sessionToken,
      "Transfer-Encoding": "chunked",
    },
  });
  req.on("error", () => {});
  req.write("{");
  await wait(20);
  req.destroy();
  await wait(20);
  expect(calls).toBe(0);
  expect((await post(s)).status).toBe(200);
  expect(calls).toBe(1);
});
test("synchronous provider cannot outrun a timer and return after its deadline", async () => {
  const s = await setup({
    timeoutMs: 5,
    totalTimeoutMs: 100,
    provider: {
      ...provider,
      generate: async () => {
        const until = performance.now() + 20;
        while (performance.now() < until) {}
        return { text: fixture };
      },
    },
  });
  expect((await post(s)).status).toBe(504);
});
test("chunked oversized requests return sanitized JSON 413 without dropping connection", async () => {
  const s = await setup({ provider, requestBytes: 40 });
  const response = await new Promise<{ status: number; body: string }>(
    (resolve, reject) => {
      const req = httpRequest(
        s.base + "/api/generate",
        {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:5178",
            "Content-Type": "application/json",
            "X-SiteForge-Session": s.data.sessionToken,
            "Transfer-Encoding": "chunked",
          },
        },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve({ status: res.statusCode!, body }));
        },
      );
      req.on("error", reject);
      req.write("x".repeat(50));
      req.end();
    },
  );
  expect(response.status).toBe(413);
  expect(JSON.parse(response.body)).toMatchObject({
    error: { code: "REQUEST_TOO_LARGE" },
  });
});
test("custom output byte bound rejects output without retry", async () => {
  let calls = 0;
  const s = await setup({
    responseBytes: 20,
    provider: {
      ...provider,
      generate: async () => {
        calls++;
        return { text: fixture };
      },
    },
  });
  expect((await post(s)).status).toBe(502);
  expect(calls).toBe(1);
});
test.each([429, 500, 503])("retries transient HTTP %i once", async (status) => {
  let calls = 0;
  const s = await setup({
    provider: {
      ...provider,
      generate: async () => {
        if (++calls === 1) throw new ProviderError("HTTP", status, 1);
        return { text: fixture };
      },
    },
  });
  expect((await post(s)).status).toBe(200);
  expect(calls).toBe(2);
});
test.each([
  new ProviderError("HTTP", 401),
  new ProviderError("HTTP", 403),
  new ProviderError("REFUSAL"),
  new Error("secret-key private prompt raw-body"),
])("does not retry permanent errors or leak details", async (error) => {
  let calls = 0;
  const s = await setup({
    provider: {
      ...provider,
      generate: async () => {
        calls++;
        throw error;
      },
    },
  });
  const r = await post(s);
  expect(r.status).toBe(502);
  expect(calls).toBe(1);
  expect(await r.text()).not.toMatch(/secret-key|private prompt|raw-body/);
});
test("caps retries at two calls", async () => {
  let calls = 0;
  const s = await setup({
    provider: {
      ...provider,
      generate: async () => {
        calls++;
        throw new ProviderError("NETWORK");
      },
    },
  });
  expect((await post(s)).status).toBe(502);
  expect(calls).toBe(2);
});
test("rejects concurrent jobs and releases admission after completion", async () => {
  let release!: (v: { text: string }) => void;
  const s = await setup({
    provider: {
      ...provider,
      generate: () =>
        new Promise((r) => {
          release = r;
        }),
    },
  });
  const first = post(s);
  while (!release) await wait(1);
  expect((await post(s)).status).toBe(429);
  release({ text: fixture });
  expect((await first).status).toBe(200);
});
test("limits admissions per minute", async () => {
  const s = await setup({ provider, rateLimit: 1 });
  expect((await post(s)).status).toBe(200);
  expect((await post(s)).status).toBe(429);
});
test("times out abort-ignoring providers and never accepts delayed results", async () => {
  let signal!: AbortSignal;
  const s = await setup({
    timeoutMs: 15,
    totalTimeoutMs: 30,
    provider: {
      ...provider,
      generate: async (_req, sig) => {
        signal = sig;
        await wait(60);
        return { text: fixture };
      },
    },
  });
  expect((await post(s)).status).toBe(504);
  expect(signal.aborted).toBe(true);
  await wait(70);
});
test("Retry-After beyond deadline does not make another call", async () => {
  let calls = 0;
  const s = await setup({
    totalTimeoutMs: 30,
    provider: {
      ...provider,
      generate: async () => {
        calls++;
        throw new ProviderError("HTTP", 429, 5000);
      },
    },
  });
  expect((await post(s)).status).toBe(504);
  expect(calls).toBe(1);
});
test("client disconnect aborts active provider", async () => {
  let signal!: AbortSignal;
  const s = await setup({
    timeoutMs: 100,
    provider: {
      ...provider,
      generate: async (_req, sig) => {
        signal = sig;
        await wait(110);
        return { text: fixture };
      },
    },
  });
  const req = httpRequest(s.base + "/api/generate", {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:5178",
      "Content-Type": "application/json",
      "X-SiteForge-Session": s.data.sessionToken,
    },
  });
  req.on("error", () => {});
  req.end(JSON.stringify({ name: "Demo", prompt: "Hello" }));
  while (!signal) await wait(1);
  req.destroy();
  await wait(15);
  expect(signal.aborted).toBe(true);
});
const provider: WebsiteGenerationProvider = {
  id: "mock",
  model: "test-fixture",
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
async function setup(
  options: Parameters<typeof createGenerationServer>[0] = {},
) {
  const server = createGenerationServer(options);
  owned.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("address");
  const base = `http://127.0.0.1:${address.port}`;
  const status = await fetch(base + "/api/generation/status");
  return { server, base, status, data: await status.json() };
}
test("default backend is disabled and exposes a random session token without calling a provider", async () => {
  const s = await setup();
  expect(s.status.status).toBe(200);
  expect(s.data).toMatchObject({ mode: "disabled", model: "" });
  expect(s.data.sessionToken).toMatch(/^[a-f0-9]{64}$/);
  const result = await fetch(s.base + "/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5178",
      "X-SiteForge-Session": s.data.sessionToken,
    },
    body: JSON.stringify({ name: "Demo", prompt: "Hello" }),
  });
  expect(result.status).toBe(503);
});

async function post(
  s: Awaited<ReturnType<typeof setup>>,
  body: unknown = { name: "Demo", prompt: "Hello" },
  headers: Record<string, string> = {},
) {
  return new Promise<Response>((resolve, reject) => {
    const req = httpRequest(
      s.base + "/api/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://127.0.0.1:5178",
          "X-SiteForge-Session": s.data.sessionToken,
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), { status: res.statusCode }),
          ),
        );
      },
    );
    req.on("error", reject);
    req.end(typeof body === "string" ? body : JSON.stringify(body));
  });
}
test("mock generation returns canonical new project with explicit provenance", async () => {
  const s = await setup({ provider });
  expect(s.data.mode).toBe("mock");
  const r = await post(s);
  expect(r.status).toBe(200);
  const result = await r.json();
  expect(result.mode).toBe("mock");
  expect(result.candidate.generation).toMatchObject({
    provider: "mock",
    mode: "mock",
    model: "test-fixture",
  });
  expect(result.candidate.id).toMatch(/^[a-f0-9-]{36}$/);
  expect(result.candidate.blocks[0].id).toBe(result.candidate.id + "-b0");
});
test.each<Record<string, string>>([
  { Origin: "https://evil.test" },
  { Origin: "" },
  { "X-SiteForge-Session": "bad" },
  { "Sec-Fetch-Site": "cross-site" },
  { Host: "localhost:1" },
])("rejects hostile request headers %j", async (headers) => {
  const s = await setup({ provider });
  expect((await post(s, undefined, headers)).status).toBe(403);
});
test("status rejects hostile Origin and sets non-cacheable nosniff headers", async () => {
  const s = await setup();
  expect(s.status.headers.get("cache-control")).toBe("no-store");
  expect(s.status.headers.get("x-content-type-options")).toBe("nosniff");
  expect(
    (
      await fetch(s.base + "/api/generation/status", {
        headers: { Origin: "https://evil.test" },
      })
    ).status,
  ).toBe(403);
});
test.each([
  [{ name: "Demo", prompt: "Hello", projectId: "x" }, 400],
  ["{bad", 400],
  [{ name: "Demo", prompt: "x".repeat(17000) }, 413],
])("rejects invalid request %j", async (body, status) => {
  const s = await setup({ provider });
  expect((await post(s, body)).status).toBe(status);
});
test("requires JSON content type", async () => {
  const s = await setup({ provider });
  expect(
    (await post(s, undefined, { "Content-Type": "text/plain" })).status,
  ).toBe(415);
});
test.each([
  "not JSON",
  JSON.stringify({ blocks: [{ id: "x", type: "script", text: "bad" }] }),
  JSON.stringify({
    blocks: [
      { id: "x", type: "image", text: "", alt: "", src: "https://evil.test/a" },
    ],
  }),
])("rejects unsafe provider output", async (text) => {
  const s = await setup({
    provider: { ...provider, generate: async () => ({ text }) },
  });
  const r = await post(s);
  expect(r.status).toBe(502);
  expect(await r.text()).not.toContain(text);
});
