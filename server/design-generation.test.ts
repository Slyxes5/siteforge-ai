import { afterEach, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { createGenerationServer } from "./generation-server";
import type { WebsiteGenerationRequest } from "../src/ai/website-generation";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((done) => {
          server.close(() => done());
          server.closeAllConnections();
        }),
    ),
  );
});

test.each([
  { preference: undefined, expected: "ember-studio" },
  { preference: "ocean-modern", expected: "ocean-modern" },
])(
  "HTTP generation compiles a design with honest mock identity (%#)",
  async ({ preference, expected }) => {
    const generate = vi.fn(async (_request: WebsiteGenerationRequest) => ({
      text: JSON.stringify({
        design: "ember-studio",
        blocks: [
          {
            type: "heading",
            text: "Karya untuk Anda",
            body: "",
            action: "",
            target: "",
            style: "",
            items: [],
            email: "",
            phone: "",
            address: "",
          },
        ],
      }),
    }));
    const server = createGenerationServer({
      provider: {
        id: "mock",
        model: "design-fixture",
        outputFormat: "website-plan-v1",
        generate,
      },
    });
    servers.push(server);
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test address");
    const base = `http://127.0.0.1:${address.port}`;
    const { sessionToken } = await (
      await fetch(base + "/api/generation/status")
    ).json();
    const request = {
      name: "Design demo",
      prompt: "Website studio kreatif",
      ...(preference ? { designPreference: preference } : {}),
    };
    const response = await fetch(base + "/api/generate", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:5178",
        "Content-Type": "application/json",
        "X-SiteForge-Session": sessionToken,
      },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.mode).toBe("mock");
    expect(result.candidate.design).toEqual({ preset: expected });
    expect(result.candidate.generation).toMatchObject({
      provider: "mock",
      mode: "mock",
    });
    expect(result.candidate.revision).toBe(0);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toEqual(request);
  },
);
