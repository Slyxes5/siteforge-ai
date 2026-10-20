import { expect, test, type Page } from "@playwright/test";
import type { Server } from "node:http";
import { createGenerationServer } from "../server/generation-server";
import { createOpenRouterProvider } from "../server/openrouter-provider";
import { OPENROUTER_FREE_MODEL } from "../server/openrouter-request";
import { planFromMockContent } from "../server/mock-website-plan";
import {
  coffeeAcceptance,
  coffeeMockContent,
} from "../scripts/coffee-acceptance-scenario";
import { validateGenerationCandidate } from "../src/ai/generation-content";
import { projectSchema } from "../src/project-schema/project";
let backend: Server;
let outbound = 0;
test.beforeEach(async ({ page, context }) => {
  outbound = 0;
  const adapter = createOpenRouterProvider({
    apiKey: "synthetic-e2e-only",
    timeoutMs: 500,
    fetch: async (url, init) => {
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      outbound++;
      const request = JSON.parse(
        JSON.parse(String(init?.body)).messages[1].content,
      );
      if (request.name.includes("400"))
        return new Response("PRIVATE-provider-detail", { status: 400 });
      if (request.name.includes("Timeout"))
        return new Promise<Response>(() => {});
      const plan = planFromMockContent(coffeeMockContent);
      if (request.name.includes("Ungrounded"))
        plan.blocks.find((b) => b.type === "contact")!.phone = "+6281234567890";
      return Response.json({
        model: OPENROUTER_FREE_MODEL,
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: request.name.includes("Malformed")
                ? "```json\n{}\n```"
                : JSON.stringify(plan),
            },
          },
        ],
        usage: { cost: 0 },
      });
    },
  });
  // Honest mock provenance; actual adapter/parser/compiler execute against synthetic transport only.
  backend = createGenerationServer({
    provider: { ...adapter, id: "mock", telemetryProvider: "openrouter" },
    onGenerationEvent: () => {},
  });
  await new Promise<void>((r) => backend.listen(0, "127.0.0.1", r));
  const address = backend.address();
  if (!address || typeof address === "string") throw Error("No test port");
  const base = `http://127.0.0.1:${address.port}`;
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
test.afterEach(async () => {
  backend.closeAllConnections();
  await new Promise<void>((r) => backend.close(() => r()));
});
async function generate(page: Page, name: string) {
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
  const waiting = page.waitForResponse(
    (r) => r.url().endsWith("/api/generate") && r.request().method() === "POST",
  );
  await panel
    .getByRole("button", { name: "Generate candidate", exact: true })
    .click();
  const response = await waiting;
  return { panel, response, body: await response.json() };
}
test("OpenRouter mock → compiler → preview → Puck edit → Apply → explicit Save → reload; projects remain isolated", async ({
  page,
}) => {
  const saved: Record<string, unknown> = {};
  for (const name of ["OpenRouter Coffee One", "OpenRouter Coffee Two"]) {
    const { panel, response, body } = await generate(page, name);
    expect(response.status()).toBe(200);
    const candidate = validateGenerationCandidate(body.candidate, {
      name,
      prompt: coffeeAcceptance.prompt,
    });
    expect(candidate.blocks.map((b) => b.type)).toEqual([
      "hero",
      "features",
      "contact",
    ]);
    expect(candidate.generation).toMatchObject({
      provider: "mock",
      model: OPENROUTER_FREE_MODEL,
      mode: "mock",
    });
    expect(body.diagnostics).toMatchObject({
      provider: "openrouter",
      model: OPENROUTER_FREE_MODEL,
      providerStatus: 200,
      transportCalls: 1,
      providerAttempts: 1,
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
    expect(
      await page.evaluate(
        (id) => localStorage.getItem("siteforge:project:v1:" + id),
        candidate.id,
      ),
    ).toBeNull();
    await panel
      .getByRole("button", {
        name: "Edit candidate before saving",
        exact: true,
      })
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
      .fill("Diedit lokal: " + name);
    await expect(
      panel.getByRole("button", {
        name: "Save candidate as new project",
        exact: true,
      }),
    ).toBeDisabled();
    await editor.getByText("Apply candidate edits", { exact: true }).click();
    await expect(
      preview.getByText("Diedit lokal: " + name, { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        (id) => localStorage.getItem("siteforge:project:v1:" + id),
        candidate.id,
      ),
    ).toBeNull();
    if (Object.keys(saved).length === 0)
      await panel.screenshot({ path: "test-results/openrouter-candidate.png" });
    await panel
      .getByRole("button", {
        name: "Save candidate as new project",
        exact: true,
      })
      .click();
    const stored = await page.evaluate(
      (id) => JSON.parse(localStorage.getItem("siteforge:project:v1:" + id)!),
      candidate.id,
    );
    expect(
      projectSchema.parse(stored).blocks.find((b) => b.type === "contact"),
    ).toMatchObject({
      body: "Diedit lokal: " + name,
      email: "",
      phone: "",
      address: "",
    });
    saved[candidate.id] = stored;
    page.once("dialog", (dialog) => dialog.accept());
    await panel
      .getByRole("button", { name: "Open candidate in editor", exact: true })
      .click();
    await page.reload();
    await expect(page.locator(".projectbar strong")).toHaveText(name);
    await expect(page.locator(".editor-host .contact-block")).toBeVisible();
    for (const [id, record] of Object.entries(saved))
      expect(
        await page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem("siteforge:project:v1:" + key)!),
          id,
        ),
      ).toEqual(record);
  }
  expect(Object.keys(saved)).toHaveLength(2);
  expect(outbound).toBe(2);
  await page.screenshot({
    path: "test-results/openrouter-editor.png",
    fullPage: true,
  });
});
for (const [name, status, providerStatus] of [
  ["400", 502, 400],
  ["Malformed", 502, 200],
  ["Ungrounded", 502, 200],
  ["Timeout", 504, undefined],
] as const)
  test(`OpenRouter mock ${name}: safe error, no candidate, no retry or persistence`, async ({
    page,
  }) => {
    const { panel, response, body } = await generate(
      page,
      "OpenRouter " + name,
    );
    expect(response.status()).toBe(status);
    expect(body.diagnostics).toMatchObject({
      provider: "openrouter",
      model: OPENROUTER_FREE_MODEL,
      providerAttempts: 1,
      transportCalls: 1,
      ...(providerStatus ? { providerStatus } : {}),
    });
    expect(JSON.stringify(body)).not.toContain("PRIVATE-provider-detail");
    await expect(
      panel.getByRole("region", { name: "Candidate preview", exact: true }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(outbound).toBe(1);
  });
