import { afterEach, expect, test } from "vitest";
import type { Server } from "node:http";
import { startGenerationServer } from "./startup";
import {
  createMockEditProvider,
  editProviderFromEnvironment,
  MOCK_EDIT_INSTRUCTION,
} from "./edit-provider";

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
async function start(env: NodeJS.ProcessEnv) {
  const server = await startGenerationServer(env, { port: 0, log: () => {} });
  owned.push(server);
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test address");
  expect(address.address).toBe("127.0.0.1");
  return `http://127.0.0.1:${address.port}`;
}

test("explicit test-only edit selection runs a deterministic fixture without generation or keys", async () => {
  const base = await start({
    SITEFORGE_EDIT_PROVIDER: "mock",
    SITEFORGE_AI_TEST_MODE: "true",
  });
  const status = await (await fetch(base + "/api/edit/status")).json();
  expect(status).toMatchObject({ mode: "mock", provider: "synthetic" });
  const response = await fetch(base + "/api/edit/propose", {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:5178",
      "Content-Type": "application/json",
      "X-SiteForge-Session": status.sessionToken,
    },
    body: JSON.stringify({
      instruction: 'Set the first heading to "Welcome".',
      context: {
        name: "Demo",
        blocks: [{ id: "intro", type: "heading", text: "Before" }],
      },
    }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    mode: "mock",
    response: {
      version: 1,
      operations: [
        { op: "update", blockId: "intro", changes: { text: "Welcome" } },
      ],
    },
  });
  expect(
    await (await fetch(base + "/api/generation/status")).json(),
  ).toMatchObject({ mode: "disabled" });
});

test.each([
  {},
  { SITEFORGE_EDIT_PROVIDER: "mock" },
  { SITEFORGE_EDIT_PROVIDER: "mock", SITEFORGE_AI_TEST_MODE: "false" },
  {
    SITEFORGE_EDIT_PROVIDER: "openrouter",
    SITEFORGE_AI_TEST_MODE: "true",
    SITEFORGE_AI_ALLOW_LIVE: "true",
  },
  { SITEFORGE_AI_PROVIDER: "mock", SITEFORGE_AI_TEST_MODE: "true" },
])(
  "edit configuration remains disabled without both independent mock guards (case %#)",
  (env) => {
    expect(editProviderFromEnvironment(env)).toBeUndefined();
  },
);

test("edit configuration never reads credentials or live-provider settings", () => {
  const values: Record<string, string> = {
    SITEFORGE_EDIT_PROVIDER: "mock",
    SITEFORGE_AI_TEST_MODE: "true",
  };
  const reads: string[] = [];
  const env = new Proxy(values, {
    get(target, key) {
      if (typeof key !== "string" || !Object.hasOwn(target, key))
        throw new Error("Unrelated environment read");
      reads.push(key);
      return target[key];
    },
  });
  expect(editProviderFromEnvironment(env)?.id).toBe("synthetic");
  expect(reads).toEqual(["SITEFORGE_EDIT_PROVIDER", "SITEFORGE_AI_TEST_MODE"]);
});

test.each([
  {
    instruction: "Unsupported private instruction",
    blocks: [{ id: "intro", type: "heading" as const, text: "Before" }],
  },
  { instruction: MOCK_EDIT_INSTRUCTION, blocks: [] },
])(
  "default fixture refuses unsupported instructions or missing heading (case %#)",
  async ({ instruction, blocks }) => {
    await expect(
      createMockEditProvider().propose(
        { instruction, context: { name: "Demo", blocks } },
        new AbortController().signal,
      ),
    ).rejects.toThrow("Synthetic edit fixture unavailable.");
  },
);

test("default synthetic fixture honors an already aborted signal", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    createMockEditProvider().propose(
      {
        instruction: MOCK_EDIT_INSTRUCTION,
        context: { name: "Demo", blocks: [] },
      },
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
});
