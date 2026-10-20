import { afterEach, expect, test, vi } from "vitest";
import { createOpenRouterProvider } from "./openrouter-provider";
import {
  buildOpenRouterRequestBody,
  OPENROUTER_FREE_MODEL,
} from "./openrouter-request";
const input = { name: "Synthetic", prompt: "A synthetic website" };
afterEach(() => vi.restoreAllMocks());
test("synchronous late transport cannot outrun the adapter's elapsed deadline", async () => {
  let now = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const transport = vi.fn<typeof fetch>(async () => {
    now += 50;
    return Response.json({
      model: OPENROUTER_FREE_MODEL,
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: '{"blocks":[]}' },
        },
      ],
    });
  });
  await expect(
    createOpenRouterProvider({
      apiKey: "synthetic-only",
      timeoutMs: 10,
      fetch: transport,
    }).generate(input, new AbortController().signal),
  ).rejects.toMatchObject({ name: "TimeoutError" });
  expect(transport).toHaveBeenCalledTimes(1);
});
test("serialization uses validated original values rather than an inherited toJSON override", () => {
  const prototype = Object.defineProperty({}, "toJSON", {
    value: () => ({ name: "Altered", prompt: "PRIVATE" }),
    enumerable: false,
  });
  const value = Object.assign(Object.create(prototype), input);
  const body = JSON.parse(buildOpenRouterRequestBody(value));
  expect(JSON.parse(body.messages[1].content)).toEqual(input);
  expect(JSON.stringify(body)).not.toContain("PRIVATE");
});
test("options cannot widen the fixed response/deadline resource ceilings", () => {
  expect(() =>
    createOpenRouterProvider({
      apiKey: "synthetic-only",
      responseBytes: 131073,
    }),
  ).toThrow();
  expect(() =>
    createOpenRouterProvider({ apiKey: "synthetic-only", timeoutMs: 90001 }),
  ).toThrow();
});
