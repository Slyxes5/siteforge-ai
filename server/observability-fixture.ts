import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createGenerationServer } from "./generation-server";
import { createGeminiProvider } from "./gemini-provider";
import type { WebsiteGenerationProvider } from "../src/ai/website-generation";
// Dedicated synthetic test process. Never select a provider or read credentials from env.
delete process.env.SITEFORGE_GEMINI_API_KEY;
globalThis.fetch = async () => {
  throw new Error(
    "Native external fetch is forbidden in the observability fixture.",
  );
};
const log = resolve("test-results/observability-fixture.jsonl");
mkdirSync(resolve("test-results"), { recursive: true });
writeFileSync(log, "");
const content = JSON.stringify({
  blocks: [
    { id: "title", type: "heading", text: "Observability mock candidate" },
    {
      id: "intro",
      type: "paragraph",
      text: "Synthetic fixture content; not real AI.",
    },
  ],
});
const envelope = (text: string) =>
  JSON.stringify({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }],
  });
const provider: WebsiteGenerationProvider = {
  id: "mock",
  model: "mock-observability-fixture",
  async generate(request, signal, context) {
    const transport: typeof fetch = async () => {
      if (
        request.name === "OBS:rpc-invalid" ||
        request.name === "OBS:rpc-precondition"
      )
        return Response.json(
          {
            error: {
              code: 400,
              status:
                request.name === "OBS:rpc-invalid"
                  ? "INVALID_ARGUMENT"
                  : "FAILED_PRECONDITION",
              message: "PRIVATE-PROVIDER-MESSAGE",
              details: [{ PRIVATE: "PRIVATE" }],
            },
          },
          { status: 400 },
        );
      if (request.name === "OBS:slow") await delay(60, undefined, { signal });
      if (request.name === "OBS:timeout" || request.name === "OBS:cancel")
        await delay(2000, undefined, { signal });
      if (/^OBS:(400|401|403|404|429|500|503)$/.test(request.name))
        return new Response("PRIVATE-RAW-RESPONSE", {
          status: Number(request.name.slice(4)),
        });
      if (request.name === "OBS:malformed")
        return new Response("PRIVATE-NOT-JSON", { status: 200 });
      if (request.name === "OBS:signature")
        return Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: content,
                    thoughtSignature: "PRIVATE-SYNTHETIC-SIGNATURE",
                    partMetadata: { source: "PRIVATE-SYNTHETIC-SOURCE" },
                  },
                ],
              },
            },
          ],
        });
      if (request.name === "OBS:unicode")
        return new Response(
          envelope(
            JSON.stringify({
              blocks: [
                { id: "title", type: "heading", text: "😀".repeat(2000) },
                {
                  id: "intro",
                  type: "paragraph",
                  text: "Synthetic Unicode boundary fixture.",
                },
              ],
            }),
          ),
        );
      if (request.name === "OBS:empty") return new Response("");
      if (request.name === "OBS:truncated")
        return Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] });
      if (request.name === "OBS:refusal")
        return Response.json({ candidates: [{ finishReason: "SAFETY" }] });
      if (request.name === "OBS:contentjson")
        return new Response(envelope("PRIVATE-NOT-CONTENT-JSON"));
      if (request.name === "OBS:missingfield")
        return new Response(
          envelope(
            JSON.stringify({
              blocks: [
                {
                  id: "title",
                  type: "heading",
                  "PRIVATE-FIELD": "PRIVATE-VALUE",
                },
              ],
            }),
          ),
        );
      if (request.name === "OBS:ungrounded")
        return new Response(
          envelope(
            JSON.stringify({
              blocks: [
                {
                  id: "contact",
                  type: "contact",
                  text: "Contact",
                  body: "",
                  email: "PRIVATE@example.test",
                  phone: "",
                  address: "",
                },
              ],
            }),
          ),
        );
      if (request.name === "OBS:unsupported")
        return new Response(
          envelope(
            JSON.stringify({
              blocks: [{ id: "bad", type: "script", text: "PRIVATE-CONTENT" }],
            }),
          ),
        );
      if (request.name === "OBS:stream")
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("{"));
            },
          }),
        );
      return new Response(envelope(content), {
        headers: { "Content-Type": "application/json" },
      });
    };
    // Real adapter/parser, synthetic transport. Outer provider gives explicit mock provenance.
    return createGeminiProvider({
      contract: "m2c",
      apiKey: "synthetic-observability-only",
      model: "gemini-3.5-flash-lite",
      fetch: transport,
    }).generate(
      request.name === "OBS:request-contract"
        ? { ...request, prompt: "" }
        : request,
      signal,
      context,
    );
  },
};
const server = createGenerationServer({
  provider,
  maxAttempts: 1,
  timeoutMs: 1200,
  totalTimeoutMs: 2500,
  rateLimit: 100,
  onGenerationEvent: (event) =>
    appendFileSync(log, JSON.stringify(event) + "\n"),
});
server.prependListener("request", (request, response) => {
  if (
    request.method !== "POST" ||
    request.url !== "/api/generate" ||
    request.headers["x-siteforge-fixture"] !== "delivery_stall"
  )
    return;
  const end = response.end;
  // Fault injection only: emit headers and a partial body, then withhold completion.
  response.end = function (...args: unknown[]) {
    if (response.statusCode === 200) {
      response.write('{"');
      return response;
    }
    return Reflect.apply(end, response, args);
  } as typeof response.end;
});
server.on("error", () => {
  console.error("Mock observability fixture could not bind its loopback port.");
  process.exitCode = 1;
});
server.listen(5188, "127.0.0.1", () =>
  console.log(
    "Observability fixture ready on loopback:5188 mode=mock (external fetch blocked)",
  ),
);
const stop = () => {
  server.close();
  server.closeAllConnections();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
