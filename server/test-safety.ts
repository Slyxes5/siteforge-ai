import { beforeAll, afterAll, vi } from "vitest";
// Defense in depth: this suite can reach loopback only. Gemini always uses an injected fetch.
const originalFetch = globalThis.fetch;
beforeAll(() =>
  vi.stubGlobal("fetch", ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1")
      throw new Error("External network is forbidden in server tests.");
    return originalFetch(input, init);
  }) as typeof fetch),
);
afterAll(() => vi.unstubAllGlobals());
