import { test, expect, type Page } from "@playwright/test";
import { fullProject, storageKey } from "./fixtures";
import { buildCandidate } from "../src/ai/generation-content";
async function openGenerator(
  page: Page,
  name = "Mock coffee site",
  prompt = "A website for a neighborhood coffee shop.",
) {
  await page
    .getByRole("button", { name: "Generate website", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Website generator",
    exact: true,
  });
  await panel.getByLabel("Website name").fill(name);
  await panel.getByLabel("Website prompt").fill(prompt);
  return panel;
}
async function seed(page: Page) {
  await page.addInitScript(
    ({ key, project }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(project));
    },
    { key: storageKey, project: fullProject },
  );
  await page.goto("/");
}
const lateCandidate = buildCandidate(
  JSON.stringify({
    blocks: [{ id: "heading", type: "heading", text: "Late mock result" }],
  }),
  { name: "Late site", prompt: "Test only" },
  { id: "mock", model: "test-fixture" },
  "late-id",
);

test("M2B mock backend → validate → candidate preview → explicit save → edit/reload", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:5189") &&
      !request.url().startsWith("data:")
    )
      external.push(request.url());
  });
  await seed(page);
  const original = await page.evaluate(
    (key) => localStorage.getItem(key),
    storageKey,
  );
  const panel = await openGenerator(page);
  const response = page.waitForResponse(
    (res) =>
      res.url().endsWith("/api/generate") && res.request().method() === "POST",
  );
  await panel
    .getByRole("button", { name: "Generate candidate", exact: true })
    .click();
  const result = await (await response).json();
  expect(result.mode).toBe("mock");
  expect(result.candidate.generation).toMatchObject({
    kind: "ai",
    provider: "mock",
    mode: "mock",
  });
  await expect(
    panel.getByRole("region", { name: "Candidate preview" }),
  ).toBeVisible();
  await expect(
    panel.getByText("TEST MOCK — not real AI", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      "siteforge:project:v1:" + result.candidate.id,
    ),
  ).toBeNull();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(original);
  await page.screenshot({
    path: "test-results/m2b-mock-candidate.png",
    fullPage: true,
  });
  await panel
    .getByRole("button", { name: "Save candidate as new project", exact: true })
    .click();
  await expect(
    panel.getByText("Candidate saved as a new project.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      "siteforge:project:v1:" + result.candidate.id,
    ),
  ).toEqual(result.candidate);
  await expect(page.locator(".projectbar strong")).toHaveText("Studio North");
  await panel.getByRole("button", { name: "Open candidate in editor" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".projectbar strong")).toHaveText(
    "Mock coffee site",
  );
  await page
    .locator(".editor-host")
    .getByRole("button")
    .filter({ has: page.locator(".hero-title") })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: /^(Headline|Text)$/ })
    .fill("Edited mock-generated website");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    "Edited mock-generated website",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(original);
  expect(external).toEqual([]);
  await page.screenshot({
    path: "test-results/m2b-mock-editor.png",
    fullPage: true,
  });
});

for (const [name, prompt] of [
  ["Coffee test", "Coffee shop with drinks, story and contact."],
  ["Barbershop test", "Barbershop with services and appointment contact."],
  [
    "Portfolio test",
    "Designer portfolio with selected projects and biography.",
  ],
  ["Business test", "General business website with services and contact."],
])
  test(
    "M2B mock pipeline accepts category brief: " + name,
    async ({ page }) => {
      await page.goto("/");
      const panel = await openGenerator(page, name, prompt);
      await panel
        .getByRole("button", { name: "Generate candidate", exact: true })
        .click();
      await expect(
        panel.getByRole("region", { name: "Candidate preview" }),
      ).toBeVisible();
      await expect(
        panel.getByText("TEST MOCK — not real AI", { exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => localStorage.length)).toBe(0);
    },
  );

test("M2B rate limit error offers an explicitly non-AI template candidate without autosave", async ({
  page,
}) => {
  await page.route("**/api/generate", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "RATE_LIMIT", message: "Limit" } }),
    }),
  );
  await seed(page);
  const original = await page.evaluate(
    (key) => localStorage.getItem(key),
    storageKey,
  );
  const panel = await openGenerator(page);
  await panel
    .getByRole("button", { name: "Generate candidate", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("rate limit");
  await panel.getByLabel("Fallback template").selectOption("coffee-shop");
  await panel
    .getByRole("button", { name: "Use local template fallback" })
    .click();
  await expect(
    panel.getByText("Template fallback — not AI", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(1);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(original);
  await page.screenshot({
    path: "test-results/m2b-template-fallback.png",
    fullPage: true,
  });
});

for (const [label, body] of [
  ["malformed JSON", "not-json"],
  [
    "unsupported blocks",
    JSON.stringify({
      mode: "mock",
      candidate: {
        ...lateCandidate,
        blocks: [{ id: "late-id-b0", type: "script", text: "unsafe" }],
      },
    }),
  ],
  [
    "unsafe image URL",
    JSON.stringify({
      mode: "mock",
      candidate: {
        ...lateCandidate,
        blocks: [
          {
            id: "late-id-b0",
            type: "image",
            src: "https://tracker.test/pixel",
            alt: "",
            text: "",
          },
        ],
      },
    }),
  ],
])
  test("M2B rejects " + label + " before preview/save", async ({ page }) => {
    await page.route("**/api/generate", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body }),
    );
    await seed(page);
    const panel = await openGenerator(page);
    await panel
      .getByRole("button", { name: "Generate candidate", exact: true })
      .click();
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(
      panel.getByRole("region", { name: "Candidate preview" }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.length)).toBe(1);
  });

test("M2B cancellation ignores delayed results without storing them", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let entered!: () => void;
  const seen = new Promise<void>((resolve) => (entered = resolve));
  await page.route("**/api/generate", async (route) => {
    entered();
    await gate;
    await route
      .fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ candidate: lateCandidate, mode: "mock" }),
      })
      .catch(() => {});
  });
  await seed(page);
  const panel = await openGenerator(page);
  await panel
    .getByRole("button", { name: "Generate candidate", exact: true })
    .click();
  await seen;
  await panel.getByRole("button", { name: "Cancel generation" }).click();
  release();
  await expect(panel.getByText(/Generation cancelled/)).toBeVisible();
  await expect(
    panel.getByRole("region", { name: "Candidate preview" }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(1);
});

test("M2B changing projects rejects a delayed old generation response", async ({
  page,
}) => {
  await page.addInitScript((project) => {
    localStorage.setItem(
      "siteforge:project:v1:" + project.id,
      JSON.stringify(project),
    );
    localStorage.setItem(
      "siteforge:project:v1:other",
      JSON.stringify({ ...project, id: "other", name: "Other saved project" }),
    );
  }, fullProject);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let entered!: () => void;
  const seen = new Promise<void>((resolve) => (entered = resolve));
  await page.route("**/api/generate", async (route) => {
    entered();
    await gate;
    await route
      .fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ candidate: lateCandidate, mode: "mock" }),
      })
      .catch(() => {});
  });
  await page.goto("/");
  const panel = await openGenerator(page);
  await panel
    .getByRole("button", { name: "Generate candidate", exact: true })
    .click();
  await seen;
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page
    .getByRole("article", { name: "Project Other saved project", exact: true })
    .getByRole("button", { name: "Open", exact: true })
    .click();
  release();
  await expect(page.locator(".projectbar strong")).toHaveText(
    "Other saved project",
  );
  await expect(
    panel.getByRole("region", { name: "Candidate preview" }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(2);
});

test("M2B mobile fallback candidate remains usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const panel = await openGenerator(
    page,
    "Mobile test website",
    "A simple business website.",
  );
  expect(
    await panel
      .getByRole("button", { name: "Close generator" })
      .evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getClientRects().length;
      }),
  ).toBe(1);
  await panel
    .getByRole("button", { name: "Use local template fallback" })
    .click();
  const candidate = panel.getByRole("region", { name: "Candidate preview" });
  await expect(candidate).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const save = panel.getByRole("button", {
    name: "Save candidate as new project",
  });
  await save.scrollIntoViewIfNeeded();
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.screenshot({
    path: "test-results/m2b-generator-mobile.png",
    fullPage: true,
  });
});

test("M2B disabled backend does not submit provider generation", async ({
  page,
}) => {
  let posts = 0;
  await page.route("**/api/generation/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "disabled",
        model: "",
        sessionToken: "disabled-session-token-123456789",
      }),
    }),
  );
  await page.route("**/api/generate", (route) => {
    posts++;
    return route.abort();
  });
  await page.goto("/");
  const panel = await openGenerator(page);
  await panel
    .getByRole("button", { name: "Generate candidate", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("disabled");
  expect(posts).toBe(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
