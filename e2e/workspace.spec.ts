import { test, expect } from "@playwright/test";
const key = "siteforge:project:v1:siteforge-starter";
test("Edit → Live Preview → Preview → Save → Reload → browser refresh", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".save-status")).toHaveText("● Unsaved changes");
  await expect(page.locator(".editor-host .hero-title")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Great ideas deserve a place to grow.",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Text", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Built with SiteForge M1");
  await page.locator(".live-preview summary").click();
  await expect(
    page
      .getByLabel("Live document preview")
      .getByRole("heading", { name: "Built with SiteForge M1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Website device preview"]')
      .getByRole("heading", { name: "Built with SiteForge M1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("✓ All changes saved");
  const stored = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!),
    key,
  );
  expect(stored.schemaVersion).toBe(1);
  expect(stored.blocks[0].text).toBe("Built with SiteForge M1");
  expect(stored.content).toBeUndefined();
  await page.getByRole("button", { name: "Back to editor" }).click();
  await page.getByRole("button", { name: "Reload project" }).click();
  await expect(page.locator(".editor-host .hero-title")).toHaveText(
    "Built with SiteForge M1",
  );
  await page.reload();
  await expect(page.locator(".editor-host .hero-title")).toHaveText(
    "Built with SiteForge M1",
  );
  await expect(page.locator(".save-status")).toHaveText("✓ All changes saved");
  await page.screenshot({
    path: "test-results/m1-editor-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.screenshot({
    path: "test-results/m1-preview-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
