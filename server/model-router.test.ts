import { expect, test, vi } from "vitest";
import { createModelRouter } from "./model-router";
import { ProviderError } from "./provider-error";
const input = { prompt: "Synthetic" };
const options = (
  invoke: (
    request: typeof input,
    signal: AbortSignal,
    dispatch: () => void,
  ) => Promise<string>,
) => ({
  models: [
    { model: "gemini-primary", invoke },
    {
      model: "gemini-fallback",
      invoke: vi.fn(
        async (_i: typeof input, _s: AbortSignal, d: () => void) => {
          d();
          return "fallback";
        },
      ),
    },
  ],
  validate: () => {},
  maxAttempts: 2,
  attemptTimeoutMs: 15,
  totalTimeoutMs: 80,
  delayMs: 0,
});
test("dispatch is nonrefundable and a provider cannot dispatch twice", async () => {
  let sends = 0;
  const o = options(async (_i, _s, d) => {
    d();
    sends++;
    d();
    sends++;
    return "invalid";
  });
  await expect(
    createModelRouter(o).run(input, new AbortController().signal),
  ).rejects.toThrow();
  expect(sends).toBe(1);
  expect(o.models[1].invoke).not.toHaveBeenCalled();
});
test("deadline bounds a dispatched noncooperative provider and never falls back", async () => {
  const o = options(async (_i, _s, d) => {
    d();
    return new Promise<string>(() => {});
  });
  const result = await Promise.race([
    createModelRouter(o)
      .run(input, new AbortController().signal)
      .catch((e: unknown) => e),
    new Promise((resolve) => setTimeout(() => resolve("OUTER_TIMEOUT"), 150)),
  ]);
  expect(result).toBeInstanceOf(Error);
  expect(o.models[1].invoke).not.toHaveBeenCalled();
});
test("duplicate models and excess attempt budgets are refused before invoking anything", () => {
  const invoke = vi.fn(async () => "result");
  const o = options(invoke);
  expect(() =>
    createModelRouter({ ...o, models: [o.models[0], o.models[0]] }),
  ).toThrow();
  expect(() => createModelRouter({ ...o, maxAttempts: 3 })).toThrow();
});
test("telemetry tracks selected model, fallback reason and outbound without leaking inputs", async () => {
  const snapshots: unknown[] = [];
  const o = options(async (_i, _s, d) => {
    d();
    throw new ProviderError("HTTP", 429);
  });
  const result = await createModelRouter(o).run(
    { prompt: "PRIVATE" },
    new AbortController().signal,
    (snapshot) => snapshots.push(snapshot),
  );
  expect(result.model).toBe("gemini-fallback");
  expect(snapshots.at(-1)).toMatchObject({
    selectedModel: "gemini-fallback",
    outboundRequests: 2,
    attempts: [
      {
        model: "gemini-primary",
        reason: "primary",
        outcome: "http_rejected",
        outbound: 1,
        providerStatus: 429,
      },
      {
        model: "gemini-fallback",
        reason: "http_429",
        outcome: "returned",
        outbound: 1,
      },
    ],
  });
  expect(JSON.stringify(snapshots)).not.toContain("PRIVATE");
});

test("explicit HTTP503 rejection falls back once and returns actual selected model", async () => {
  const primary = vi.fn(
    async (
      _input: typeof input,
      _signal: AbortSignal,
      dispatch: () => void,
    ) => {
      dispatch();
      throw new ProviderError("HTTP", 503);
    },
  );
  const fallback = vi.fn(
    async (
      _input: typeof input,
      _signal: AbortSignal,
      dispatch: () => void,
    ) => {
      dispatch();
      return "synthetic result";
    },
  );
  const router = createModelRouter({
    models: [
      { model: "gemini-primary", invoke: primary },
      { model: "gemini-fallback", invoke: fallback },
    ],
    validate: () => {},
    maxAttempts: 2,
    attemptTimeoutMs: 100,
    totalTimeoutMs: 500,
    delayMs: 0,
  });
  const result = await router.run(input, new AbortController().signal);
  expect(result).toEqual({
    model: "gemini-fallback",
    value: "synthetic result",
  });
  expect(primary).toHaveBeenCalledTimes(1);
  expect(fallback).toHaveBeenCalledTimes(1);
});
