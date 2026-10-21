import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { startGenerationServer } from "./startup";
import { editProviderFromEnvironment } from "./edit-provider";
import { createHttpEditProvider } from "../src/ai/edit-client";
import { createStructuredEditProposal } from "../src/ai/structured-edit";
import { previewEditProposal } from "../src/ai/edit-proposal";
import { OPENROUTER_EDIT_MODEL } from "../src/ai/edit-source";
import { sampleProject } from "../src/project-schema/project";

const source = {
  provider: "openrouter",
  model: OPENROUTER_EDIT_MODEL,
} as const;
const configured = {
  SITEFORGE_EDIT_PROVIDER: "openrouter",
  SITEFORGE_EDIT_ALLOW_LIVE: "true",
  SITEFORGE_EDIT_FREE_ONLY_CONFIRMED: "true",
  SITEFORGE_EDIT_OPENROUTER_API_KEY: "synthetic-offline-edit-credential",
};
const operations = {
  version: 1,
  operations: [
    {
      op: "update",
      blockId: "hero-heading",
      changes: { text: "Selamat Datang" },
    },
  ],
};
const envelope = (content: unknown = operations) =>
  Response.json({
    model: OPENROUTER_EDIT_MODEL,
    usage: { cost: 0 },
    choices: [
      {
        finish_reason: "stop",
        message: { role: "assistant", content: JSON.stringify(content) },
      },
    ],
  });
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
  content: unknown = operations,
  env: NodeJS.ProcessEnv = configured,
) {
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => envelope(content));
  const log = vi.fn();
  const server = await startGenerationServer(env, {
    port: 0,
    log,
    editTransport: transport,
  });
  owned.push(server);
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test address.");
  const base = `http://127.0.0.1:${address.port}`;
  const browserFetch: typeof fetch = (url, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Origin", "http://127.0.0.1:5178");
    return fetch(base + String(url), { ...init, headers });
  };
  return { base, browserFetch, transport, log };
}

describe("live editing wiring with an exclusively synthetic external transport", () => {
  it.each([
    {},
    { SITEFORGE_EDIT_PROVIDER: "openrouter" },
    { ...configured, SITEFORGE_EDIT_ALLOW_LIVE: "false" },
    { ...configured, SITEFORGE_EDIT_FREE_ONLY_CONFIRMED: "false" },
    { ...configured, SITEFORGE_AI_TEST_MODE: "true" },
    { SITEFORGE_AI_PROVIDER: "openrouter", SITEFORGE_AI_ALLOW_LIVE: "true" },
  ])(
    "does not inspect credentials or enable editing with incomplete guards (%#)",
    (values) => {
      const env = new Proxy(values, {
        get(target, key) {
          if (typeof key === "string" && /KEY|TOKEN|SECRET/.test(key))
            throw new Error("Credential access forbidden.");
          return target[key as keyof typeof target];
        },
      });
      expect(editProviderFromEnvironment(env)).toBeUndefined();
    },
  );

  it("constructs without transport calls and pins the edit-specific configuration", () => {
    const transport = vi.fn<typeof fetch>();
    expect(editProviderFromEnvironment(configured, transport)).toMatchObject({
      id: "openrouter-edit",
      source,
    });
    expect(transport).not.toHaveBeenCalled();
    expect(() =>
      editProviderFromEnvironment(
        { ...configured, SITEFORGE_EDIT_MODEL: "openrouter/free" },
        transport,
      ),
    ).toThrow("Unsupported edit model.");
    expect(() =>
      editProviderFromEnvironment(
        { ...configured, SITEFORGE_EDIT_TIMEOUT_MS: "45001" },
        transport,
      ),
    ).toThrow();
  });

  it("advertises live editing independently of disabled generation", async () => {
    const s = await setup();
    expect(await (await fetch(s.base + "/api/edit/status")).json()).toEqual({
      mode: "live",
      ...source,
      sessionToken: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(
      await (await fetch(s.base + "/api/generation/status")).json(),
    ).toMatchObject({ mode: "disabled" });
    expect(s.transport).not.toHaveBeenCalled();
    expect(JSON.stringify(s.log.mock.calls)).not.toContain(
      configured.SITEFORGE_EDIT_OPENROUTER_API_KEY,
    );
  });

  it("rejects a valid session without explicit live consent before provider dispatch", async () => {
    const s = await setup();
    const status = await (await fetch(s.base + "/api/edit/status")).json();
    const response = await s.browserFetch("/api/edit/propose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SiteForge-Session": status.sessionToken,
      },
      body: JSON.stringify({
        instruction: "Ubah judul menjadi Selamat Datang.",
        context: { name: sampleProject.name, blocks: sampleProject.blocks },
      }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "CONSENT_REQUIRED" },
    });
    expect(s.transport).not.toHaveBeenCalled();
  });

  it("routes HTTP through the adapter and creates a truthful host-owned live proposal", async () => {
    const s = await setup();
    const project = structuredClone(sampleProject);
    project.generation = {
      kind: "template",
      templateId: "original",
      templateVersion: 1,
    };
    const before = structuredClone(project);
    const client = createHttpEditProvider(s.browserFetch, {
      mode: "live",
      consent: true,
    });
    const proposal = await createStructuredEditProposal(
      project,
      "Ubah judul menjadi Selamat Datang.",
      client,
      new AbortController().signal,
    );
    expect(proposal).toMatchObject({
      mode: "live",
      source,
      projectId: project.id,
      baseRevision: project.revision,
    });
    const after = previewEditProposal(project, proposal);
    expect(after.blocks[0].text).toBe("Selamat Datang");
    expect(after.generation).toEqual(before.generation);
    expect(project).toEqual(before);
    expect(s.transport).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(
        JSON.parse(s.transport.mock.calls[0][1]!.body as string).messages,
      ),
    ).not.toContain(project.id);
  });

  it("refuses an implicit switch from mock to live before posting website content", async () => {
    const s = await setup();
    await expect(
      createHttpEditProvider(s.browserFetch).propose(
        {
          instruction: "Change title",
          context: { name: sampleProject.name, blocks: sampleProject.blocks },
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ outcome: "validation_error" });
    expect(s.transport).not.toHaveBeenCalled();
  });

  it("propagates a sanitized refusal without retry or a proposal", async () => {
    const s = await setup({ refusal: true });
    await expect(
      createHttpEditProvider(s.browserFetch, {
        mode: "live",
        consent: true,
      }).propose(
        {
          instruction: "An ambiguous edit",
          context: { name: sampleProject.name, blocks: sampleProject.blocks },
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ outcome: "refused" });
    expect(s.transport).toHaveBeenCalledTimes(1);
  });
});
