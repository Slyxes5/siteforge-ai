import { test, expect } from "@playwright/test";
import { fullProject, storageKey } from "./fixtures";
test("M2A failed create/import never replaces or removes existing data", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, project }) => localStorage.setItem(key, JSON.stringify(project)),
    { key: storageKey, project: fullProject },
  );
  await page.goto("/");
  const before = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage)),
  );
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const panel = page.getByRole("region", { name: "Projects", exact: true });
  await page.evaluate(() => {
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value: () => {
        throw new DOMException("Simulated storage quota", "QuotaExceededError");
      },
    });
  });
  await panel
    .getByLabel("Project name", { exact: true })
    .fill("Must not persist");
  await panel
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("Could not create");
  const input = {
    ...fullProject,
    id: "new-import-id",
    name: "Must not import",
  };
  await panel
    .getByLabel("Project JSON file")
    .setInputFiles({
      name: "valid.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(input)),
    });
  await expect(panel.getByText(/^Ready:/)).toBeVisible();
  await panel
    .getByRole("button", { name: "Import project", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("Could not import");
  expect(
    await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))),
  ).toEqual(before);
  await expect(page.locator(".projectbar strong")).toHaveText(fullProject.name);
});
