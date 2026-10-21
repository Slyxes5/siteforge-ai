import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fullProject, storageKey } from "./fixtures";
const prefix = "siteforge:project:v1:";
async function manager(page: Page) {
  const panel = page.getByRole("region", { name: "Projects", exact: true });
  if (!(await panel.isVisible()))
    await page.getByRole("button", { name: "Projects", exact: true }).click();
  return panel;
}
async function create(page: Page, name: string, template: string) {
  const panel = await manager(page);
  await panel.getByLabel("Project name", { exact: true }).fill(name);
  await panel
    .getByLabel("Description", { exact: true })
    .fill("Created locally for " + name + ".");
  await panel.getByLabel("Starter template").selectOption(template);
  if ((await page.locator(".save-status").innerText()).includes("Unsaved"))
    page.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".projectbar strong")).toHaveText(name);
  await expect(page.locator(".editor-host .hero-block")).toBeVisible();
  return new URL(page.url()).searchParams.get("project")!;
}
async function editHero(page: Page, text: string) {
  await page
    .locator(".editor-host")
    .getByRole("button")
    .filter({ has: page.locator(".hero-block") })
    .click();
  await page.getByRole("textbox", { name: "Headline", exact: true }).fill(text);
}
async function saved(page: Page, id: string) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    prefix + id,
  );
}
async function upload(page: Page, json: string) {
  const panel = await manager(page);
  await panel.getByLabel("Project JSON file").setInputFiles({
    name: "project.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
  await expect(panel.getByText(/^Ready:/)).toBeVisible();
  return panel;
}

test("M2A create → edit → save → switch project → reopen with isolated data", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const coffee = await create(page, "Neighborhood Coffee", "coffee-shop");
  await editHero(page, "Coffee edited in M2A");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("✓ All changes saved");
  const coffeeSnapshot = await saved(page, coffee);
  const barber = await create(page, "Corner Barber", "barbershop");
  expect(barber).not.toBe(coffee);
  await editHero(page, "Barber edited independently");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const barberSnapshot = await saved(page, barber);
  const panel = await manager(page);
  await expect(panel.getByRole("article")).toHaveCount(2);
  await page.screenshot({
    path: "test-results/m2a-project-manager.png",
    fullPage: true,
  });
  await panel
    .getByRole("article", { name: "Project Neighborhood Coffee", exact: true })
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await expect(page.locator(".editor-host .hero-block .hero-title")).toHaveText(
    "Coffee edited in M2A",
  );
  expect(await saved(page, coffee)).toEqual(coffeeSnapshot);
  expect(await saved(page, barber)).toEqual(barberSnapshot);
  await page.reload();
  await expect(page.locator(".editor-host .hero-block .hero-title")).toHaveText(
    "Coffee edited in M2A",
  );
  await expect(page.locator(".save-status")).toHaveText("✓ All changes saved");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Website device preview"]')
      .getByRole("heading", { name: "Coffee edited in M2A" }),
  ).toBeVisible();
  const targetId = (await page
    .frameLocator('iframe[title="Website device preview"]')
    .locator('a[href^="#"]')
    .first()
    .getAttribute("href"))!.slice(1);
  expect(
    await page
      .frameLocator('iframe[title="Website device preview"]')
      .locator("body")
      .evaluate(
        (body, id) => !!body.ownerDocument.getElementById(id),
        targetId,
      ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/m2a-generated-preview.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("M2A export/import exact round trip, ID conflict protection and explicit copy", async ({
  page,
}) => {
  await page.goto("/");
  const originalId = await create(page, "Portfolio Export", "portfolio");
  await editHero(page, "My exported portfolio");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const original = await saved(page, originalId);
  let panel = await manager(page);
  const downloadPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Export current JSON" }).click();
  const download = await downloadPromise;
  await download.saveAs("test-results/m2a-export.json");
  const json = await readFile("test-results/m2a-export.json", "utf8");
  expect(JSON.parse(json)).toEqual(original);
  panel = await upload(page, json);
  await panel
    .getByRole("button", { name: "Import project", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("already exists");
  expect(await saved(page, originalId)).toEqual(original);
  await panel.getByRole("checkbox", { name: /Import as a copy/ }).check();
  await panel
    .getByRole("button", { name: "Import project", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  const copyId = new URL(page.url()).searchParams.get("project")!;
  expect(copyId).not.toBe(originalId);
  const copy = await saved(page, copyId);
  expect(copy).toEqual({ ...original, id: copyId, revision: 0 });
  panel = await manager(page);
  page.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("article")
    .filter({ hasText: originalId })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      prefix + originalId,
    ),
  ).toBeNull();
  panel = await upload(page, json);
  await panel.getByRole("checkbox", { name: /Import as a copy/ }).uncheck();
  await panel
    .getByRole("button", { name: "Import project", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  expect(await saved(page, originalId)).toEqual(original);
  expect(await saved(page, copyId)).toEqual(copy);
  await page.reload();
  await expect(page.locator(".editor-host .hero-block .hero-title")).toHaveText(
    "My exported portfolio",
  );
});

test("M2A rename and delete confirmation preserve other projects and unsaved drafts", async ({
  page,
}) => {
  await page.goto("/");
  const keepId = await create(page, "Keep Business", "business");
  const keep = await saved(page, keepId);
  const removeId = await create(page, "Temporary Portfolio", "portfolio");
  let panel = await manager(page);
  let row = panel.getByRole("article", {
    name: "Project Temporary Portfolio",
    exact: true,
  });
  await row.getByRole("button", { name: "Rename", exact: true }).click();
  await row.getByLabel("New project name").fill("Renamed Portfolio");
  await row.getByRole("button", { name: "Confirm rename" }).click();
  await expect(
    panel.getByRole("article", {
      name: "Project Renamed Portfolio",
      exact: true,
    }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Close projects" }).click();
  await editHero(page, "Preserve this unsaved draft");
  panel = await manager(page);
  row = panel.getByRole("article", {
    name: "Project Renamed Portfolio",
    exact: true,
  });
  page.once("dialog", (dialog) => dialog.dismiss());
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  expect(await saved(page, removeId)).not.toBeNull();
  await expect(page.locator(".editor-host .hero-block .hero-title")).toHaveText(
    "Preserve this unsaved draft",
  );
  let warned = false;
  page.once("dialog", (dialog) => {
    warned = dialog.message().includes("Unsaved edits");
    return dialog.accept();
  });
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  expect(warned).toBe(true);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), prefix + removeId),
  ).toBeNull();
  expect(await saved(page, keepId)).toEqual(keep);
  await expect(panel.getByRole("article")).toHaveCount(1);
  await expect(page.locator(".projectbar strong")).toHaveText(
    "Untitled project",
  );
});

test("M2A legacy/corrupt records and invalid imports are preserved without migration", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, project }) => {
      localStorage.setItem(key, JSON.stringify(project));
      localStorage.setItem("siteforge:project:v1:corrupt", "do not erase");
      localStorage.setItem("unrelated-app", "untouched");
    },
    { key: storageKey, project: fullProject },
  );
  await page.goto("/");
  const before = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage)),
  );
  const panel = await manager(page);
  await expect(
    panel.getByRole("article", { name: "Project Studio North", exact: true }),
  ).toBeVisible();
  await expect(panel.getByText(/Some records could not be read/)).toBeVisible();
  await panel.getByLabel("Project JSON file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...fullProject, schemaVersion: 2 })),
  });
  await expect(panel.getByRole("alert")).toContainText("Could not read");
  await expect(
    panel.getByRole("button", { name: "Import project", exact: true }),
  ).toBeDisabled();
  await panel.getByLabel("Project JSON file").setInputFiles({
    name: "large.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(4 * 1024 * 1024 + 1, 32),
  });
  await expect(panel.getByRole("alert")).toContainText("too large");
  expect(
    await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))),
  ).toEqual(before);
});

test("M2A mobile create flow retains the existing minimal shell without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  let panel = await manager(page);
  await expect(panel.getByLabel("Project name")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expect(page.locator(".editor-host .hero-title")).toBeVisible();
  await page.screenshot({
    path: "test-results/m2a-manager-mobile.png",
    fullPage: true,
  });
  const id = await create(page, "Mobile Studio", "business");
  expect((await saved(page, id)).name).toBe("Mobile Studio");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/m2a-preview-mobile.png",
    fullPage: true,
  });
});
