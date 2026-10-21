import { createSmokeServer } from "../server/smoke-startup";
import { coffeeMockContent } from "./coffee-acceptance-scenario";
import { planFromMockContent } from "../server/mock-website-plan";
// Test-only process: discard the inherited key without reading it; forbid native transport.
delete process.env.SITEFORGE_GEMINI_API_KEY;
globalThis.fetch = async () => {
  throw new Error("Native external fetch forbidden in coffee acceptance mock.");
};
const smoke = createSmokeServer({}, ["--mock"], async () =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [
            {
              text: JSON.stringify(planFromMockContent(coffeeMockContent)),
              thoughtSignature: "synthetic-opaque-only",
              partMetadata: { source: "synthetic-fixture" },
            },
          ],
        },
      },
    ],
  }),
);
smoke.server.on("error", () => {
  console.error("Coffee acceptance mock could not bind its loopback port.");
  process.exitCode = 1;
});
smoke.server.listen(5188, "127.0.0.1", () =>
  console.log(
    "Coffee acceptance ready: mode=mock maxAttempts=1 outboundLimit=1 nativeFetch=blocked",
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
