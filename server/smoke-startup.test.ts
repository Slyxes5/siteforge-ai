import { afterEach, expect, test, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
const children: ChildProcess[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise<void>((resolve) =>
        child.once("exit", () => resolve()),
      );
      child.kill();
      await stopped;
    }
  }
});
import { createSmokeServer, singleUseTransport } from "./smoke-startup";
const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});
async function connect(smoke: ReturnType<typeof createSmokeServer>) {
  servers.push(smoke.server);
  await new Promise<void>((resolve) =>
    smoke.server.listen(0, "127.0.0.1", resolve),
  );
  const address = smoke.server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server unavailable");
  const base = "http://127.0.0.1:" + address.port;
  const status = await (await fetch(base + "/api/generation/status")).json();
  return {
    base,
    status,
    post: () =>
      fetch(base + "/api/generate", {
        method: "POST",
        headers: {
          Origin: "http://127.0.0.1:5178",
          "Content-Type": "application/json",
          "X-SiteForge-Session": status.sessionToken,
        },
        body: JSON.stringify({
          name: "Smoke fixture",
          prompt: "Synthetic test content only.",
        }),
      }),
  };
}
test("mock launcher exercises Gemini response parsing and canonical candidate construction with no real key", async () => {
  const env: NodeJS.ProcessEnv = {
    SITEFORGE_AI_ALLOW_LIVE: "true",
    SITEFORGE_AI_ROUTER_ENABLED: "true",
    SITEFORGE_AI_FALLBACK_MODELS: '["gemini-3.8-flash"]',
    SITEFORGE_AI_VERIFIED_MODELS:
      '["gemini-3.5-flash-lite","gemini-3.8-flash"]',
    SITEFORGE_AI_FREE_TIER_CONFIRMED: "true",
  };
  Object.defineProperty(env, "SITEFORGE_GEMINI_API_KEY", {
    get() {
      throw new Error("Mock must not read a credential");
    },
  });
  const transportEvents: unknown[] = [];
  const smoke = createSmokeServer(env, ["--mock"], undefined, (event) =>
    transportEvents.push(event),
  );
  const client = await connect(smoke);
  expect(client.status.mode).toBe("mock");
  expect(smoke.outboundRequests()).toBe(0);
  const response = await client.post();
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.candidate.generation).toMatchObject({
    kind: "ai",
    provider: "mock",
    mode: "mock",
  });
  expect(result.candidate.blocks).toHaveLength(2);
  expect(transportEvents).toEqual([
    { transportCalls: 1, providerStatus: null, transportState: "dispatched" },
    { transportCalls: 1, providerStatus: 200, transportState: "headers" },
  ]);
  expect(smoke.outboundRequests()).toBe(1);
  // Expiring the HTTP rate window must not replenish the lifetime transport budget.
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60001);
  expect((await client.post()).status).toBe(502);
  expect(smoke.outboundRequests()).toBe(1);
});

const syntheticLiveEnv: NodeJS.ProcessEnv = {
  SITEFORGE_AI_PROVIDER: "gemini",
  SITEFORGE_AI_ALLOW_LIVE: "true",
  SITEFORGE_SMOKE_FREE_TIER_CONFIRMED: "true",
  SITEFORGE_GEMINI_API_KEY: "synthetic-test-only",
  SITEFORGE_AI_TEST_MODE: "false",
};
test("an explicit fully gated synthetic live configuration constructs without making any request", () => {
  const transport = vi.fn<typeof fetch>();
  const smoke = createSmokeServer(syntheticLiveEnv, ["--live"], transport);
  expect(smoke.mode).toBe("live");
  expect(smoke.server.listening).toBe(false);
  expect(transport).not.toHaveBeenCalled();
});
test("default is disabled even when inherited flags are live; it never reads the key", async () => {
  const env = { ...syntheticLiveEnv };
  Object.defineProperty(env, "SITEFORGE_GEMINI_API_KEY", {
    get() {
      throw new Error("Disabled must not read key");
    },
  });
  const transport = vi.fn<typeof fetch>();
  const smoke = createSmokeServer(env, [], transport);
  const client = await connect(smoke);
  expect(client.status.mode).toBe("disabled");
  expect((await client.post()).status).toBe(503);
  expect(transport).not.toHaveBeenCalled();
});
for (const [field, value] of [
  ["SITEFORGE_AI_PROVIDER", "mock"],
  ["SITEFORGE_AI_ALLOW_LIVE", "false"],
  ["SITEFORGE_SMOKE_FREE_TIER_CONFIRMED", "false"],
  ["SITEFORGE_GEMINI_API_KEY", ""],
  ["SITEFORGE_AI_TEST_MODE", "true"],
])
  test("live mode fails closed for missing prerequisite " + field, () => {
    const transport = vi.fn<typeof fetch>();
    expect(() =>
      createSmokeServer(
        { ...syntheticLiveEnv, [field]: value },
        ["--live"],
        transport,
      ),
    ).toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

for (const kind of ["429", "500", "network", "malformed"])
  test(
    "one-attempt HTTP pipeline never retries or refunds its budget after " +
      kind,
    async () => {
      const transport = vi.fn<typeof fetch>().mockImplementation(async () => {
        if (kind === "network")
          throw new Error("Synthetic private diagnostic: DO-NOT-REFLECT");
        return new Response(
          kind === "malformed" ? "not-json" : "DO-NOT-REFLECT",
          {
            status: kind === "malformed" ? 200 : Number(kind),
            headers: { "Retry-After": "3600" },
          },
        );
      });
      const smoke = createSmokeServer({}, ["--mock"], transport);
      const client = await connect(smoke);
      const response = await client.post();
      // If maxAttempts were 2, Retry-After=3600 would change the result to a deadline error.
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain("DO-NOT-REFLECT");
      expect(transport).toHaveBeenCalledTimes(1);
      vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60001);
      expect((await client.post()).status).toBe(502);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(smoke.outboundRequests()).toBe(1);
    },
  );
test("model is configurable without source edits and invalid models fail closed", async () => {
  const smoke = createSmokeServer(
    { SITEFORGE_GEMINI_MODEL: "gemini-test-only" },
    ["--mock"],
  );
  const client = await connect(smoke);
  expect(client.status.model).toBe("gemini-test-only");
  expect(() =>
    createSmokeServer({ SITEFORGE_GEMINI_MODEL: "bad/model" }, ["--mock"]),
  ).toThrow();
});
test("unknown or combined arguments cannot select live mode", () => {
  for (const args of [
    ["--unknown"],
    ["--mock", "--live"],
    ["--live", "--live"],
  ])
    expect(() => createSmokeServer(syntheticLiveEnv, args)).toThrow();
});
test("a pre-aborted call does not reach the transport", async () => {
  const transport = vi.fn<typeof fetch>();
  const budget = singleUseTransport(transport);
  const controller = new AbortController();
  controller.abort();
  await expect(
    budget.fetch("https://unused.test", { signal: controller.signal }),
  ).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
  expect(budget.outboundRequests()).toBe(0);
});

for (const mode of ["disabled", "mock"])
  test(
    "actual CLI starts on loopback in " +
      mode +
      " without making a provider request",
    async () => {
      const probe = createServer();
      await new Promise<void>((resolve) =>
        probe.listen(0, "127.0.0.1", resolve),
      );
      const address = probe.address();
      if (!address || typeof address === "string")
        throw new Error("Test port unavailable");
      const port = address.port;
      await new Promise<void>((resolve) => probe.close(() => resolve()));
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "--eval",
          `
            const nativeFetch=globalThis.fetch;
            globalThis.fetch=(input,init)=>{
              const url=new URL(input instanceof Request?input.url:String(input));
              if(url.protocol!=='http:' || url.hostname!=='127.0.0.1')throw new Error('External fetch blocked in CLI tests');
              return nativeFetch(input,init);
            };
            process.argv=[process.execPath,'server/smoke-start.ts',...${JSON.stringify(mode === "mock" ? ["--mock"] : [])}];
            await import('./server/smoke-start.ts');
            if(process.env.SITEFORGE_GEMINI_API_KEY!==undefined)throw new Error('Non-live child retained its credential environment');
            console.log('credential-env-cleared');
          `,
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            SITEFORGE_BACKEND_PORT: String(port),
            SITEFORGE_GEMINI_API_KEY: "synthetic-child-only",
            SITEFORGE_GEMINI_MODEL: "gemini-3.5-flash-lite",
            SITEFORGE_AI_ALLOW_LIVE: "false",
            SITEFORGE_AI_PROVIDER: "gemini",
            SITEFORGE_AI_TEST_MODE: "false",
            SITEFORGE_SMOKE_FREE_TIER_CONFIRMED: "false",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      children.push(child);
      let output = "";
      await new Promise<void>((resolve, reject) => {
        child.stdout!.on("data", (chunk) => {
          output += String(chunk);
          if (
            output.includes("mode=" + mode) &&
            output.includes("credential-env-cleared")
          )
            resolve();
        });
        child.once("error", () => reject(new Error("CLI startup failed")));
        child.once("exit", () =>
          reject(new Error("CLI exited before ready; output suppressed")),
        );
      });
      expect(output).toContain("maxAttempts=1");
      expect(output).not.toContain("synthetic-child-only");
      const status = await (
        await fetch("http://127.0.0.1:" + port + "/api/generation/status")
      ).json();
      expect(status.mode).toBe(mode);
      const response = await fetch(
        "http://127.0.0.1:" + port + "/api/generate",
        {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:5178",
            "Content-Type": "application/json",
            "X-SiteForge-Session": status.sessionToken,
          },
          body: JSON.stringify({
            name: "CLI smoke fixture",
            prompt: "Synthetic test only",
          }),
        },
      );
      expect(response.status).toBe(mode === "mock" ? 200 : 503);
      if (mode === "mock") {
        const data = await response.json();
        expect(data.candidate.generation).toMatchObject({
          provider: "mock",
          mode: "mock",
        });
        expect(data.candidate.blocks).toHaveLength(2);
      }
    },
  );

test("cancellation after dispatch consumes the budget and cannot trigger another transport", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async (_input, init) =>
        new Promise((_resolve, reject) =>
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("Synthetic cancellation")),
            { once: true },
          ),
        ),
    );
  const budget = singleUseTransport(transport);
  const controller = new AbortController();
  const pending = budget.fetch("https://unused.test", {
    signal: controller.signal,
  });
  controller.abort();
  await expect(pending).rejects.toThrow();
  await expect(budget.fetch("https://unused.test")).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(budget.outboundRequests()).toBe(1);
});
test("Gemini transport keeps the fixed official endpoint and rejects redirects", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    new Response("", {
      status: 302,
      headers: { Location: "https://untrusted.test" },
    }),
  );
  const smoke = createSmokeServer({}, ["--mock"], transport);
  const client = await connect(smoke);
  expect((await client.post()).status).toBe(502);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0][0]).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
  );
  expect(transport.mock.calls[0][1]?.redirect).toBe("error");
});

test("hard budget rejects a second concurrent transport call before reaching the network", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
  const budget = singleUseTransport(transport);
  const results = await Promise.allSettled([
    budget.fetch("https://unused.test"),
    budget.fetch("https://unused.test"),
  ]);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(budget.outboundRequests()).toBe(1);
  expect(results[1].status).toBe("rejected");
});
