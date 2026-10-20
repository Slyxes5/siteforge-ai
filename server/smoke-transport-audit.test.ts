import { expect, test, vi } from "vitest";
import { createSmokeTransportAudit } from "./smoke-transport-audit";
test("records only dispatch count and numeric HTTP response before body parsing", async () => {
  const events: unknown[] = [];
  const response = new Response("PRIVATE-BODY", { status: 200 });
  const transport = vi.fn<typeof fetch>(async () => response);
  const audited = createSmokeTransportAudit(transport, (event) =>
    events.push(event),
  );
  expect(
    await audited("https://example.test", {
      headers: { "x-private": "PRIVATE" },
    }),
  ).toBe(response);
  expect(events).toEqual([
    { transportCalls: 1, providerStatus: null, transportState: "dispatched" },
    { transportCalls: 1, providerStatus: 200, transportState: "headers" },
  ]);
  expect(response.bodyUsed).toBe(false);
  expect(JSON.stringify(events)).not.toContain("PRIVATE");
});
test("network errors remain safe metadata and do not trigger a second call", async () => {
  const events: unknown[] = [];
  const transport = vi.fn<typeof fetch>(async () => {
    throw Error("PRIVATE");
  });
  const audited = createSmokeTransportAudit(transport, (event) =>
    events.push(event),
  );
  await expect(audited("https://example.test")).rejects.toThrow();
  expect(events).toEqual([
    { transportCalls: 1, providerStatus: null, transportState: "dispatched" },
    {
      transportCalls: 1,
      providerStatus: null,
      transportState: "network_error",
    },
  ]);
  expect(transport).toHaveBeenCalledTimes(1);
});
