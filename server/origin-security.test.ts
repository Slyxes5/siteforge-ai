import { afterEach, describe, expect, test, vi } from "vitest";
import { request as httpRequest, type Server } from "node:http";
import { createGenerationServer } from "./generation-server";
import { createMockEditProvider, MOCK_EDIT_INSTRUCTION } from "./edit-provider";

const frontendOrigin = "http://127.0.0.1:5173";
const defaultOrigins = [
  frontendOrigin,
  "http://127.0.0.1:5178",
  "http://127.0.0.1:5189",
];
const editRequest = {
  instruction: MOCK_EDIT_INSTRUCTION,
  context: {
    name: "Demo",
    blocks: [{ id: "intro", type: "heading", text: "Before" }],
  },
};
const generationRequest = { name: "Demo", prompt: "Hello" };
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
  kind: "editing" | "generation",
  allowedOrigins?: string[],
) {
  const editProvider = createMockEditProvider();
  const propose = vi.spyOn(editProvider, "propose");
  const generate = vi.fn(async () => ({
    text: JSON.stringify({
      blocks: [{ id: "intro", type: "heading", text: "Hello" }],
    }),
  }));
  const server = createGenerationServer({
    onGenerationEvent: () => {},
    editProvider,
    provider: { id: "mock", model: "origin-fixture", generate },
    ...(allowedOrigins === undefined ? {} : { allowedOrigins }),
  });
  owned.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  const base = `http://127.0.0.1:${address.port}`;
  const statusPath =
    kind === "editing" ? "/api/edit/status" : "/api/generation/status";
  const postPath = kind === "editing" ? "/api/edit/propose" : "/api/generate";
  const status = await fetch(base + statusPath, {
    headers: { Connection: "close" },
  });
  expect(status.status).toBe(200);
  const { sessionToken } = await status.json();
  expect(sessionToken).toMatch(/^[a-f0-9]{64}$/);
  const headers = new Headers({
    Origin: frontendOrigin,
    "Content-Type": "application/json",
    "X-SiteForge-Session": sessionToken,
  });
  return {
    server,
    base,
    statusPath,
    postPath,
    headers,
    propose,
    generate,
    // fetch rewrites Host in this runtime; node:http sends the exact test headers.
    post: (currentHeaders: Headers = headers) =>
      new Promise<Response>((resolve, reject) => {
        const req = httpRequest(
          base + postPath,
          { method: "POST", headers: Object.fromEntries(currentHeaders) },
          (res) => {
            const chunks: Buffer[] = [];
            const responseHeaders = new Headers();
            for (let index = 0; index < res.rawHeaders.length; index += 2)
              responseHeaders.append(
                res.rawHeaders[index],
                res.rawHeaders[index + 1],
              );
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("error", reject);
            res.on("end", () =>
              resolve(
                new Response(Buffer.concat(chunks), {
                  status: res.statusCode,
                  headers: responseHeaders,
                }),
              ),
            );
          },
        );
        req.on("error", reject);
        req.end(
          JSON.stringify(kind === "editing" ? editRequest : generationRequest),
        );
      }),
  };
}

function expectNoDispatch(s: Awaited<ReturnType<typeof setup>>) {
  expect(s.propose).not.toHaveBeenCalled();
  expect(s.generate).not.toHaveBeenCalled();
}

async function expectForbidden(response: Response) {
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    error: { code: "FORBIDDEN", message: "Request is not allowed." },
  });
}

describe.each(["editing", "generation"] as const)(
  "%s Origin security",
  (kind) => {
    test.each(defaultOrigins)(
      "accepts status and authenticated mock POST from %s",
      async (origin) => {
        const s = await setup(kind);
        const status = await fetch(s.base + s.statusPath, {
          headers: { Origin: origin },
        });
        expect(status.status).toBe(200);
        expect(status.headers.get("access-control-allow-origin")).toBe(origin);
        expect(status.headers.get("vary")).toBe("Origin");
        expect(status.headers.get("cache-control")).toBe("no-store");
        expect(status.headers.get("x-content-type-options")).toBe("nosniff");
        const data = await status.json();
        expect(data.mode).toBe("mock");
        expectNoDispatch(s);
        s.headers.set("Origin", origin);
        s.headers.set("X-SiteForge-Session", data.sessionToken);
        const response = await s.post();
        expect(response.status).toBe(200);
        expect(response.headers.get("access-control-allow-origin")).toBe(
          origin,
        );
        expect(response.headers.get("vary")).toBe("Origin");
        const body = await response.json();
        if (kind === "editing") {
          expect(body).toEqual({
            mode: "mock",
            response: {
              version: 1,
              operations: [
                {
                  op: "update",
                  blockId: "intro",
                  changes: { text: "Welcome" },
                },
              ],
            },
          });
          expect(s.propose).toHaveBeenCalledOnce();
          expect(s.generate).not.toHaveBeenCalled();
        } else {
          expect(body.mode).toBe("mock");
          expect(body.candidate.generation).toMatchObject({
            provider: "mock",
            mode: "mock",
            model: "origin-fixture",
          });
          expect(body.candidate.blocks[0]).toMatchObject({
            type: "heading",
            text: "Hello",
          });
          expect(s.generate).toHaveBeenCalledOnce();
          expect(s.propose).not.toHaveBeenCalled();
        }
      },
    );

    test.each([
      "https://hostile.test",
      "http://127.0.0.1:5174",
      "http://127.0.0.1:5173.evil.test",
      "null",
    ])("rejects unauthorized status and POST Origin %s", async (origin) => {
      const s = await setup(kind);
      s.headers.set("Origin", origin);
      const status = await fetch(s.base + s.statusPath, {
        headers: { Origin: origin },
      });
      expect(status.headers.get("access-control-allow-origin")).toBeNull();
      await expectForbidden(status);
      const response = await s.post();
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      await expectForbidden(response);
      expectNoDispatch(s);
    });

    test.each(["missing", "empty", "invalid"])(
      "rejects a %s session token with the frontend Origin",
      async (token) => {
        const s = await setup(kind);
        if (token === "missing") s.headers.delete("X-SiteForge-Session");
        else
          s.headers.set(
            "X-SiteForge-Session",
            token === "empty" ? "" : "invalid",
          );
        await expectForbidden(await s.post());
        expectNoDispatch(s);
      },
    );

    test("rejects a missing Origin even with a valid session", async () => {
      const s = await setup(kind);
      s.headers.delete("Origin");
      await expectForbidden(await s.post());
      expectNoDispatch(s);
    });

    test.each(["localhost:1", "hostile.test"])(
      "rejects Host %s even with an allowed Origin and valid session",
      async (host) => {
        const s = await setup(kind);
        s.headers.set("Host", host);
        await expectForbidden(await s.post());
        expectNoDispatch(s);
      },
    );

    test("rejects cross-site Fetch Metadata with an allowed Origin and valid session", async () => {
      const s = await setup(kind);
      s.headers.set("Sec-Fetch-Site", "cross-site");
      await expectForbidden(await s.post());
      expectNoDispatch(s);
    });

    test.each(defaultOrigins)(
      "preserves restrictive preflight for %s",
      async (origin) => {
        const s = await setup(kind);
        const response = await fetch(s.base + s.postPath, {
          method: "OPTIONS",
          headers: { Origin: origin },
        });
        expect(response.status).toBe(204);
        expect(response.headers.get("access-control-allow-origin")).toBe(
          origin,
        );
        expect(response.headers.get("access-control-allow-methods")).toBe(
          "POST",
        );
        expect(response.headers.get("access-control-allow-headers")).toBe(
          "Content-Type, X-SiteForge-Session",
        );
        expect(
          response.headers.get("access-control-allow-credentials"),
        ).toBeNull();
        expectNoDispatch(s);
      },
    );

    test("rejects unauthorized preflight without reflecting its Origin", async () => {
      const s = await setup(kind);
      const response = await fetch(s.base + s.postPath, {
        method: "OPTIONS",
        headers: { Origin: "https://hostile.test" },
      });
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      await expectForbidden(response);
      expectNoDispatch(s);
    });

    test("explicit allowedOrigins still replaces rather than extends defaults", async () => {
      const customOrigin = "http://127.0.0.1:5190";
      const s = await setup(kind, [customOrigin]);
      await expectForbidden(await s.post());
      expectNoDispatch(s);
      s.headers.set("Origin", customOrigin);
      expect((await s.post()).status).toBe(200);
    });
  },
);

test.each(["/api/edit/status", "/api/edit/propose"])(
  "frontend Origin does not bypass loopback peer verification for %s",
  async (path) => {
    const s = await setup("editing");
    s.server.on("connection", (socket) =>
      Object.defineProperty(socket, "remoteAddress", { value: "192.0.2.10" }),
    );
    const response = await fetch(s.base + path, {
      method: path === s.postPath ? "POST" : "GET",
      headers: { ...Object.fromEntries(s.headers), Connection: "close" },
      ...(path === s.postPath ? { body: JSON.stringify(editRequest) } : {}),
    });
    await expectForbidden(response);
    expectNoDispatch(s);
  },
);
