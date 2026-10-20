import { expect, test } from "vitest";
import { getEventListeners } from "node:events";
import {
  readProviderRpcStatus,
  RPC_DIAGNOSTIC_LIMITS,
} from "./provider-rpc-status";
import { createGeminiProvider } from "./gemini-provider";
const signal = () => new AbortController().signal;

test.each(["INVALID_ARGUMENT", "FAILED_PRECONDITION"])(
  "keeps only provider RPC enum %s",
  async (status) => {
    const response = Response.json(
      {
        error: {
          code: 400,
          status,
          message: "PRIVATE",
          details: [{ PRIVATE: "PRIVATE" }],
        },
      },
      { status: 400 },
    );
    const abort = signal();
    expect(await readProviderRpcStatus(response, abort)).toBe(status);
    expect(getEventListeners(abort, "abort")).toHaveLength(0);
  },
);

test.each([
  { error: { code: 400, status: "PRIVATE" } },
  { error: { code: 403, status: "INVALID_ARGUMENT" } },
  { error: { code: "400", status: "INVALID_ARGUMENT" } },
  { error: { status: "INVALID_ARGUMENT" } },
  { status: "INVALID_ARGUMENT" },
  null,
])("discards arbitrary or inconsistent RPC error envelopes", async (body) => {
  expect(
    await readProviderRpcStatus(Response.json(body, { status: 400 }), signal()),
  ).toBeUndefined();
});

test.each([
  "PRIVATE-NOT-JSON",
  "",
  "x".repeat(RPC_DIAGNOSTIC_LIMITS.bytes + 1),
])("malformed/oversized diagnostics remain unknown", async (text) => {
  expect(
    await readProviderRpcStatus(new Response(text, { status: 400 }), signal()),
  ).toBeUndefined();
});

test("content-length bound cancels without retaining the body", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
    {
      status: 400,
      headers: { "Content-Length": String(RPC_DIAGNOSTIC_LIMITS.bytes + 1) },
    },
  );
  expect(await readProviderRpcStatus(response, signal())).toBeUndefined();
  expect(cancelled).toBe(true);
});

test("stalled diagnostic body cannot replace known HTTP400 with a timeout or another request", async () => {
  let cancelled = false,
    calls = 0;
  const provider = createGeminiProvider({
    apiKey: "synthetic-contract-only",
    fetch: async () => {
      calls++;
      return new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        { status: 400 },
      );
    },
  });
  const abort = signal();
  const start = performance.now();
  await expect(
    provider.generate({ name: "Synthetic", prompt: "Synthetic" }, abort),
  ).rejects.toMatchObject({ code: "HTTP", status: 400, rpcStatus: undefined });
  expect(performance.now() - start).toBeLessThan(1000);
  expect(calls).toBe(1);
  expect(cancelled).toBe(true);
  expect(getEventListeners(abort, "abort")).toHaveLength(0);
});

test("abort cancels optional diagnostics and removes its listener", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const pending = readProviderRpcStatus(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { status: 400 },
    ),
    controller.signal,
  );
  controller.abort();
  expect(await pending).toBeUndefined();
  expect(cancelled).toBe(true);
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});
