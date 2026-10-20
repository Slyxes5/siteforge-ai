import { expect, test, vi } from "vitest";
import { getEventListeners } from "node:events";
import {
  createModelRouter,
  ModelRouterTimeout,
  type RouterModel,
} from "./model-router";
import { ProviderError } from "./provider-error";
import { modelRoutingSchema } from "../src/ai/model-routing";
const request = { prompt: "Synthetic fixture only" };
type Invoke = RouterModel<typeof request, string>["invoke"];
const make = (invoke: Invoke, extra = {}) => ({
  models: [
    { model: "gemini-primary", invoke },
    {
      model: "gemini-fallback",
      invoke: vi.fn<Invoke>(async (_i, _s, d) => {
        d();
        return "fallback";
      }),
    },
  ],
  validate: () => {},
  maxAttempts: 2,
  attemptTimeoutMs: 20,
  totalTimeoutMs: 100,
  delayMs: 0,
  ...extra,
});

test("primary success never consults fallback and emits a consistent terminal snapshot", async () => {
  const o = make(async (_i, _s, d) => {
    d();
    return "primary";
  });
  const states: unknown[] = [];
  expect(
    await createModelRouter(o).run(request, new AbortController().signal, (s) =>
      states.push(s),
    ),
  ).toEqual({ model: "gemini-primary", value: "primary" });
  expect(o.models[1].invoke).not.toHaveBeenCalled();
  expect(modelRoutingSchema.safeParse(states.at(-1)).success).toBe(true);
  expect(states.at(-1)).toMatchObject({
    outboundRequests: 1,
    selectedModel: "gemini-primary",
  });
});

test.each([400, 401, 403, 404, 500, 502, 504, 418])(
  "HTTP %i never falls back",
  async (status) => {
    const error = new ProviderError("HTTP", status);
    const o = make(async (_i, _s, d) => {
      d();
      throw error;
    });
    await expect(
      createModelRouter(o).run(request, new AbortController().signal),
    ).rejects.toBe(error);
    expect(o.models[1].invoke).not.toHaveBeenCalled();
  },
);

test.each([
  "NETWORK",
  "INVALID_OUTPUT",
  "REFUSAL",
  "TOO_LARGE",
  "REQUEST_CONTRACT",
] as const)(
  "%s is not evidence of safe rejection for fallback",
  async (code) => {
    const error = new ProviderError(code);
    const o = make(async (_i, _s, d) => {
      d();
      throw error;
    });
    await expect(
      createModelRouter(o).run(request, new AbortController().signal),
    ).rejects.toBe(error);
    expect(o.models[1].invoke).not.toHaveBeenCalled();
  },
);

test("all model failures stop at two, even with another model configured", async () => {
  let calls = 0;
  const invoke: Invoke = async (_i, _s, d) => {
    d();
    calls++;
    throw new ProviderError("HTTP", 503);
  };
  const o = make(invoke);
  o.models[1].invoke = invoke;
  o.models.push({ model: "gemini-extra", invoke });
  await expect(
    createModelRouter(o).run(request, new AbortController().signal),
  ).rejects.toMatchObject({ status: 503 });
  expect(calls).toBe(2);
});

test("invalid input fails before any dispatch", async () => {
  const invoke = vi.fn<Invoke>();
  const o = make(invoke, {
    validate: () => {
      throw new Error("Invalid request");
    },
  });
  await expect(
    createModelRouter(o).run(request, new AbortController().signal),
  ).rejects.toThrow("Invalid request");
  expect(invoke).not.toHaveBeenCalled();
});

test("one-attempt budget forbids fallback", async () => {
  const o = make(
    async (_i, _s, d) => {
      d();
      throw new ProviderError("HTTP", 429);
    },
    { maxAttempts: 1 },
  );
  await expect(
    createModelRouter(o).run(request, new AbortController().signal),
  ).rejects.toMatchObject({ status: 429 });
  expect(o.models[1].invoke).not.toHaveBeenCalled();
});

test("pre-dispatch timeout may switch model but late first dispatch is fenced", async () => {
  let actualSends = 0;
  let lateError: unknown;
  const o = make(async (_i, _s, d) => {
    await new Promise((r) => setTimeout(r, 60));
    try {
      d();
      actualSends++;
    } catch (e) {
      lateError = e;
      throw e;
    }
    return "late";
  });
  const result = await createModelRouter(o).run(
    request,
    new AbortController().signal,
  );
  expect(result.model).toBe("gemini-fallback");
  await new Promise((r) => setTimeout(r, 70));
  expect(actualSends).toBe(0);
  expect(lateError).toBeInstanceOf(Error);
});

test("Retry-After outside remaining budget stops without switching", async () => {
  const o = make(async (_i, _s, d) => {
    d();
    throw new ProviderError("HTTP", 429, 1000);
  });
  await expect(
    createModelRouter(o).run(request, new AbortController().signal),
  ).rejects.toBeInstanceOf(ModelRouterTimeout);
  expect(o.models[1].invoke).not.toHaveBeenCalled();
});

test("parent cancellation after dispatch is final and removes relay listeners", async () => {
  const parent = new AbortController();
  let dispatched!: () => void;
  const ready = new Promise<void>((r) => {
    dispatched = r;
  });
  const o = make(async (_i, _s, d) => {
    d();
    dispatched();
    return new Promise<string>(() => {});
  });
  const pending = createModelRouter(o).run(request, parent.signal);
  await ready;
  parent.abort(new Error("Cancelled"));
  await expect(pending).rejects.toThrow("Cancelled");
  expect(o.models[1].invoke).not.toHaveBeenCalled();
  expect(getEventListeners(parent.signal, "abort")).toHaveLength(0);
});

test("pre-aborted input never invokes any provider", async () => {
  const parent = new AbortController();
  parent.abort();
  const invoke = vi.fn<Invoke>();
  await expect(
    createModelRouter(make(invoke)).run(request, parent.signal),
  ).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});

test("successful routing removes parent listeners and tolerates a broken observer", async () => {
  const parent = new AbortController();
  expect(
    (
      await createModelRouter(
        make(async (_i, _s, d) => {
          d();
          return "ok";
        }),
      ).run(request, parent.signal, () => {
        throw Error("PRIVATE");
      })
    ).value,
  ).toBe("ok");
  expect(getEventListeners(parent.signal, "abort")).toHaveLength(0);
});

test("configuration is snapshotted so later mutation cannot extend deadlines", async () => {
  const o = make(async (_i, _s, d) => {
    d();
    return new Promise<string>(() => {});
  });
  const router = createModelRouter(o);
  o.attemptTimeoutMs = 1000;
  o.totalTimeoutMs = 1000;
  const result = await Promise.race([
    router.run(request, new AbortController().signal).catch((e: unknown) => e),
    new Promise((r) => setTimeout(() => r("OUTER"), 150)),
  ]);
  expect(result).toBeInstanceOf(ModelRouterTimeout);
});
