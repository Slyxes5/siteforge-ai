import { createSmokeServer } from "../server/smoke-startup";
import { coffeeMockContent } from "./coffee-acceptance-scenario";
import {
  createMockPlanProvider,
  planFromMockContent,
} from "../server/mock-website-plan";
// Test-only process: discard the inherited key without reading it; forbid native transport.
delete process.env.SITEFORGE_GEMINI_API_KEY;
const premiumCafe = process.env.SITEFORGE_OBSERVER_SCENARIO === "premium-cafe";
const routed = process.env.SITEFORGE_OBSERVER_MODE === "mock-routed";
const planProvider = createMockPlanProvider();
globalThis.fetch = async () => {
  throw new Error("Native external fetch forbidden in coffee acceptance mock.");
};
let fixtureCalls = 0;
const smoke = createSmokeServer(
  {},
  [routed ? "--mock-routed" : "--mock"],
  async (_url, init) => {
    if (routed && ++fixtureCalls === 1)
      return Response.json(
        { error: { code: 503, status: "UNAVAILABLE" } },
        { status: 503 },
      );
    let planText: string;
    if (premiumCafe) {
      const payload = JSON.parse(String(init?.body ?? "{}"));
      const request = JSON.parse(payload.contents[0].parts[0].text);
      planText = (
        await planProvider.generate(request, new AbortController().signal)
      ).text;
    } else {
      planText = JSON.stringify(planFromMockContent(coffeeMockContent));
    }
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                text: planText,
                thoughtSignature: "synthetic-opaque-only",
                partMetadata: { source: "synthetic-fixture" },
              },
            ],
          },
        },
      ],
    });
  },
);
smoke.server.on("error", () => {
  console.error("Coffee acceptance mock could not bind its loopback port.");
  process.exitCode = 1;
});
smoke.server.listen(5188, "127.0.0.1", () =>
  console.log(
    `Coffee acceptance ready: mode=mock maxAttempts=1 outboundLimit=${smoke.outboundLimit} nativeFetch=blocked`,
  ),
);
const stop = () => {
  smoke.server.close(() =>
    console.log(
      `Coffee acceptance mock stopped. transportCalls=${smoke.outboundRequests()}`,
    ),
  );
  smoke.server.closeAllConnections();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
