import { expect, test } from "@playwright/test";
import { compileWebsitePlan } from "../src/ai/website-plan";
import {
  createMockPlanProvider,
  planFromMockContent,
} from "../server/mock-website-plan";
test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === "http://127.0.0.1:5189"
      ? route.continue()
      : route.abort(),
  );
});
const input = {
  name: "Advanced fixture",
  prompt: "A business services site with contact details.",
};
const candidate = compileWebsitePlan(
  JSON.stringify(
    planFromMockContent({
      blocks: [
        {
          id: "services",
          type: "features",
          text: "Our services",
          layout: "grid",
          items: [
            { title: "Your offering", description: "Add verified details." },
          ],
        },
        {
          id: "contact",
          type: "contact",
          text: "Contact",
          body: "Add your contact details.",
          email: "",
          phone: "",
          address: "",
        },
      ],
    }),
  ),
  input,
  { id: "mock", model: "test-fixture" },
  "advanced-candidate",
);
test("M2C edits an unsaved rich candidate through Puck before explicit Save and reload", async ({
  page,
}) => {
  await page.route("**/api/generate", (route) =>
    route.fulfill({ json: { mode: "mock", candidate } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Generate website", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Website generator",
    exact: true,
  });
  await panel.getByLabel("Website name").fill(input.name);
  await panel.getByLabel("Website prompt").fill(input.prompt);
  await panel
    .getByRole("button", { name: "Generate candidate", exact: true })
    .click();
  await expect(
    panel.getByRole("region", { name: "Candidate preview" }),
  ).toBeVisible();
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
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("owner@example.test");
  await editor
    .getByRole("textbox", { name: "Contact title", exact: true })
    .fill("Edited contact title");
  await editor
    .getByRole("textbox", { name: "Contact introduction", exact: true })
    .fill("Details entered manually for a synthetic test.");
  await editor
    .getByRole("textbox", { name: "Phone", exact: true })
    .fill("+00 000 000 000");
  await editor
    .getByRole("textbox", { name: "Address", exact: true })
    .fill("Test address — replace before publishing");
  await editor
    .getByRole("button")
    .filter({ has: page.locator(".feature-items") })
    .first()
    .click();
  await editor
    .getByRole("combobox", { name: "Layout", exact: true })
    .selectOption({ label: "List" });
  await editor.getByText("Your offering", { exact: true }).last().click();
  await editor
    .getByRole("textbox", { name: "Item title", exact: true })
    .fill("");
  await editor.getByText("Apply candidate edits", { exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("invalid");
  await expect(
    panel.getByRole("button", {
      name: "Save candidate as new project",
      exact: true,
    }),
  ).toBeDisabled();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await editor
    .getByRole("textbox", { name: "Item title", exact: true })
    .fill("Edited service item");
  await editor
    .getByRole("textbox", { name: "Item description", exact: true })
    .fill("Edited service description");
  await editor.getByText("Apply candidate edits", { exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    panel.getByText("owner@example.test", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await panel
    .getByRole("button", { name: "Save candidate as new project", exact: true })
    .click();
  const saved = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem("siteforge:project:v1:" + id)!),
    candidate.id,
  );
  expect(saved.blocks[0]).toMatchObject({
    layout: "list",
    items: [
      {
        title: "Edited service item",
        description: "Edited service description",
      },
    ],
  });
  expect(saved.blocks[1]).toMatchObject({
    text: "Edited contact title",
    body: "Details entered manually for a synthetic test.",
    email: "owner@example.test",
    phone: "+00 000 000 000",
    address: "Test address — replace before publishing",
  });
  page.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "Open candidate in editor", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".projectbar strong")).toHaveText(input.name);
  await page.reload();
  await expect(page.locator(".editor-host .contact-block h2")).toHaveText(
    "Edited contact title",
  );
  await page.screenshot({
    path: "test-results/m2c-edited-project.png",
    fullPage: true,
  });
});

for (const [category, title, layout] of [
  ["coffee shop", "Menu kopi", "grid"],
  ["barbershop", "Layanan barber", "list"],
  ["rental mobil", "Pilihan kendaraan", "grid"],
  ["portfolio", "Proyek pilihan", "list"],
  ["business", "Layanan usaha", "grid"],
] as const)
  test(
    "M2C category composition and preview: " + category,
    async ({ page }) => {
      if (category === "rental mobil")
        await page.setViewportSize({ width: 390, height: 844 });
      let posts = 0;
      await page.route("**/api/generate", async (route) => {
        posts++;
        const request = route.request().postDataJSON();
        const provider = createMockPlanProvider();
        const output = await provider.generate(
          request,
          new AbortController().signal,
        );
        const project = compileWebsitePlan(
          output.text,
          request,
          provider,
          "category-fixture",
        );
        await route.fulfill({ json: { mode: "mock", candidate: project } });
      });
      await page.goto("/");
      await page
        .getByRole("button", { name: "Generate website", exact: true })
        .click();
      const panel = page.getByRole("region", {
        name: "Website generator",
        exact: true,
      });
      await panel.getByLabel("Website name").fill("Synthetic " + category);
      await panel
        .getByLabel("Website prompt")
        .fill(
          "Create a " +
            category +
            " website. Leave unknown contact details empty.",
        );
      await panel
        .getByRole("button", { name: "Generate candidate", exact: true })
        .click();
      const preview = panel.getByRole("region", {
        name: "Candidate preview",
        exact: true,
      });
      await expect(preview).toBeVisible();
      await expect(
        preview.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await expect(preview.locator(".feature-items")).toHaveClass(
        "feature-items layout-" + layout,
      );
      await expect(
        preview.getByText("Email not provided", { exact: true }),
      ).toBeVisible();
      await expect(
        preview.getByText("TEST MOCK — not real AI", { exact: true }),
      ).toBeVisible();
      expect(posts).toBe(1);
      expect(await page.evaluate(() => localStorage.length)).toBe(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await panel.screenshot({
        path: test.info().outputPath("category-preview.png"),
      });
    },
  );

test("M2C rental fallback works while disabled without generation or automatic saves", async ({
  page,
}) => {
  let posts = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/generate")) posts++;
  });
  await page.route("**/api/generation/status", (route) =>
    route.fulfill({
      json: {
        mode: "disabled",
        model: "",
        sessionToken: "synthetic-local-only-session",
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Generate website", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Website generator",
    exact: true,
  });
  await panel.getByLabel("Website name").fill("Rental placeholder");
  await panel
    .getByLabel("Website prompt")
    .fill("Rental mobil; no business details provided.");
  await panel.getByLabel("Fallback template").selectOption("car-rental");
  await panel
    .getByRole("button", { name: "Use local template fallback", exact: true })
    .click();
  await expect(
    panel.getByRole("region", { name: "Candidate preview", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText("Template fallback — not AI", { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
