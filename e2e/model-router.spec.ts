import { expect, test } from "@playwright/test";
import { createGenerationServer } from "../server/generation-server";
import { createRoutedGenerationProvider } from "../server/routed-generation-provider";
import { createGeminiProvider } from "../server/gemini-provider";
import { planFromMockContent } from "../server/mock-website-plan";
import {
  coffeeAcceptance,
  coffeeMockContent,
} from "../scripts/coffee-acceptance-scenario";
import { validateGenerationCandidate } from "../src/ai/generation-content";

const models = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];
let outbound = 0;
const provider = createRoutedGenerationProvider(
  {
    models,
    verifiedModels: models,
    freeTierConfirmed: true,
    maxAttempts: 2,
    attemptTimeoutMs: 1000,
    totalTimeoutMs: 3000,
  },
  (model) =>
    createGeminiProvider({
      model,
      apiKey: "synthetic-browser-test-only",
      fetch: async (_url, init) => {
        outbound++;
        const body = JSON.parse(String(init?.body));
        const request = JSON.parse(body.contents[0].parts[0].text);
        const status = request.name.includes("400")
          ? 400
          : request.name.includes("all-fail") || model === models[0]
            ? 503
            : 200;
        return status !== 200
          ? Response.json(
              {
                error: {
                  code: status,
                  status: status === 400 ? "INVALID_ARGUMENT" : "UNAVAILABLE",
                },
              },
              { status },
            )
          : Response.json({
              candidates: [
                {
                  finishReason: "STOP",
                  content: {
                    parts: [
                      {
                        text: JSON.stringify(
                          planFromMockContent(coffeeMockContent),
                        ),
                      },
                    ],
                  },
                },
              ],
            });
      },
    }),
);
const backend = createGenerationServer({
  provider: { ...provider, id: "mock" },
  onGenerationEvent: () => {},
});
let base = "";
test.beforeAll(async () => {
  await new Promise<void>((r) => backend.listen(0, "127.0.0.1", r));
  const address = backend.address();
  if (!address || typeof address === "string")
    throw Error("Missing mock backend");
  base = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  backend.closeAllConnections();
  await new Promise<void>((r) => backend.close(() => r()));
});
test.beforeEach(async ({ page, context }) => {
  outbound = 0;
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === "http://127.0.0.1:5189"
      ? route.continue()
      : route.abort(),
  );
  await page.route("**/api/**", async (route) => {
    const response = await route.fetch({
      url: base + new URL(route.request().url()).pathname,
    });
    await route.fulfill({ response });
  });
});
async function generate(page: import("@playwright/test").Page, name: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Generate website", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Website generator",
    exact: true,
  });
  await panel.getByLabel("Website name").fill(name);
  await panel.getByLabel("Website prompt").fill(coffeeAcceptance.prompt);
  const pending = page.waitForResponse(
    (r) => r.url().endsWith("/api/generate") && r.request().method() === "POST",
  );
  await panel
    .getByRole("button", { name: "Generate candidate", exact: true })
    .click();
  const response = await pending;
  return { panel, response, body: await response.json() };
}
test("mock fallback → compiler → preview → Puck edit/Apply; no automatic Save", async ({
  page,
}) => {
  const { panel, response, body } = await generate(page, "Router Coffee Mock");
  expect(response.status()).toBe(200);
  expect(outbound).toBe(2);
  expect(body.candidate.generation).toMatchObject({
    model: models[1],
    mode: "mock",
  });
  expect(
    validateGenerationCandidate(body.candidate, {
      name: "Router Coffee Mock",
      prompt: coffeeAcceptance.prompt,
    }),
  ).toEqual(body.candidate);
  expect(body.diagnostics.routing).toMatchObject({
    selectedModel: models[1],
    outboundRequests: 2,
    attempts: [{ reason: "primary" }, { reason: "http_503" }],
  });
  const preview = panel.getByRole("region", {
    name: "Candidate preview",
    exact: true,
  });
  await expect(preview).toBeVisible();
  await expect(preview.locator(".feature-items article")).toHaveCount(2);
  for (const label of [
    "Email not provided",
    "Phone not provided",
    "Address not provided",
  ])
    await expect(preview.getByText(label, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await panel
    .getByRole("button", { name: "Edit candidate before saving", exact: true })
    .click();
  const editor = panel.getByRole("region", {
    name: "Candidate editor",
    exact: true,
  });
  await editor
    .getByRole("button")
    .filter({ has: page.locator(".contact-block") })
    .first()
    .click();
  await editor
    .getByRole("textbox", { name: "Contact introduction", exact: true })
    .fill("Diedit lokal setelah fallback mock.");
  await expect(
    panel.getByRole("button", {
      name: "Save candidate as new project",
      exact: true,
    }),
  ).toBeDisabled();
  await editor.getByText("Apply candidate edits", { exact: true }).click();
  await expect(
    preview.getByText("Diedit lokal setelah fallback mock.", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(outbound).toBe(2);
  await panel.screenshot({ path: "test-results/model-router-preview.png" });
});
for (const [name, calls, status] of [
  ["Router 400 Mock", 1, 400],
  ["Router all-fail Mock", 2, 503],
] as const)
  test(
    name + " remains visible error without extra request",
    async ({ page }) => {
      const { panel, response, body } = await generate(page, name);
      expect(response.status()).toBe(502);
      expect(outbound).toBe(calls);
      expect(body.diagnostics).toMatchObject({
        transportCalls: calls,
        providerStatus: status,
      });
      await expect(panel).toHaveAttribute(
        "data-generation-state",
        "provider_error",
      );
      await expect(
        panel.getByRole("region", { name: "Candidate preview", exact: true }),
      ).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.length)).toBe(0);
    },
  );
