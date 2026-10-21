import { test, expect } from "@playwright/test";
import { fullProject, storageKey } from "./fixtures";
async function seed(page: import("@playwright/test").Page) {
  await page.addInitScript(
    ({ key, project }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(project));
    },
    { key: storageKey, project: fullProject },
  );
  await page.goto("/");
  await expect(page.locator(".editor-host .site-image")).toBeVisible();
}
test("edits all six component types through real Puck fields and preserves every property", async ({
  page,
}) => {
  await seed(page);
  const host = page.locator(".editor-host");
  async function select(selector: string) {
    await host
      .getByRole("button")
      .filter({ has: page.locator(selector) })
      .click();
  }
  await page
    .getByRole("button", { name: fullProject.blocks[0].text, exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Heading edited");
  await page
    .getByRole("button", { name: fullProject.blocks[1].text, exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Paragraph edited");
  await page.getByRole("button", { name: /^Contact us/ }).click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Button edited");
  await select(".site-image");
  await page
    .getByRole("textbox", { name: "Alternative text", exact: true })
    .fill("Edited landscape alternative");
  await page
    .getByRole("textbox", { name: "Caption", exact: true })
    .fill("Caption edited");
  await select(".hero-block");
  await page
    .getByRole("textbox", { name: "Headline", exact: true })
    .fill("Hero edited");
  await select(".content-section");
  await page
    .getByRole("textbox", { name: "Section title", exact: true })
    .fill("Section edited");
  await page
    .getByRole("combobox", { name: "Color theme", exact: true })
    .selectOption({ label: "Dark" });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("✓ All changes saved");
  const stored = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!),
    storageKey,
  );
  expect(stored.blocks).toEqual(
    fullProject.blocks.map((block) => ({
      ...block,
      ...(
        {
          "hero-heading": { text: "Heading edited" },
          "hero-copy": { text: "Paragraph edited" },
          button: { text: "Button edited" },
          image: {
            alt: "Edited landscape alternative",
            text: "Caption edited",
          },
          hero: { text: "Hero edited" },
          section: { text: "Section edited", tone: "dark" },
        } as Record<string, object>
      )[block.id],
    })),
  );
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.frameLocator('iframe[title="Website device preview"]');
  for (const text of [
    "Heading edited",
    "Paragraph edited",
    "Button edited",
    "Caption edited",
    "Hero edited",
    "Section edited",
  ])
    await expect(
      preview.getByText(text, { exact: text !== "Button edited" }),
    ).toBeVisible();
  await page.screenshot({
    path: "test-results/m1-six-block-preview.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator(".editor-host .hero-block .hero-title")).toHaveText(
    "Hero edited",
  );
});
test("reload asks permission before discarding unsaved edits", async ({
  page,
}) => {
  await seed(page);
  await page
    .getByRole("button", { name: fullProject.blocks[0].text, exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Do not discard me");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Reload project" }).click();
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    "Do not discard me",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reload project" }).click();
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    fullProject.blocks[0].text,
  );
});
test("storage failures retain edits; stale revisions cannot overwrite another save", async ({
  page,
}) => {
  await seed(page);
  await page
    .getByRole("button", { name: fullProject.blocks[0].text, exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Unsaved valuable changes");
  await page.evaluate(() => {
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value: () => {
        throw new DOMException("Test quota exhausted", "QuotaExceededError");
      },
    });
  });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not save");
  await expect(page.locator(".save-status")).toContainText("Unsaved changes");
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).blocks[0].text,
      storageKey,
    ),
  ).toBe(fullProject.blocks[0].text);
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    "Unsaved valuable changes",
  );
});
test("revision conflicts preserve the other stored revision", async ({
  page,
}) => {
  await seed(page);
  await page
    .getByRole("button", { name: fullProject.blocks[0].text, exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Stale draft");
  await page.evaluate((k) => {
    const other = JSON.parse(localStorage.getItem(k)!);
    other.revision = 1;
    other.blocks[0].text = "Other tab saved";
    localStorage.setItem(k, JSON.stringify(other));
  }, storageKey);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Revision conflict");
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).blocks[0].text,
      storageKey,
    ),
  ).toBe("Other tab saved");
});
test("invalid editor text prevents save and preview until corrected", async ({
  page,
}) => {
  await seed(page);
  await page
    .getByRole("button", { name: fullProject.blocks[0].text, exact: true })
    .click();
  await page.getByRole("textbox", { name: "Text", exact: true }).fill("");
  await expect(page.getByRole("alert")).toContainText("Invalid editor data");
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Preview", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Recovered heading");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
});
test("corrupt storage is preserved and never overwritten", async ({ page }) => {
  await page.addInitScript(
    (k) => localStorage.setItem(k, "corrupt-data"),
    storageKey,
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Could not load");
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate((k) => localStorage.getItem(k), storageKey)).toBe(
    "corrupt-data",
  );
});
test("mobile editor and preview fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  for (const name of ["Save project", "Reload project", "Preview"])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeInViewport();
  await expect(page.locator(".editor-host .document-content")).toBeInViewport({
    ratio: 0.1,
  });
  await page.screenshot({
    path: "test-results/m1-editor-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: fullProject.blocks[0].text, exact: true })
    .click();
  const mobileField = page.getByRole("textbox", { name: "Text", exact: true });
  if (!(await mobileField.isVisible()))
    await page.getByText("Fields", { exact: true }).click();
  await expect(mobileField).toBeVisible();
  expect(
    await mobileField.evaluate((element) =>
      parseFloat(getComputedStyle(element).fontSize),
    ),
  ).toBeGreaterThanOrEqual(16);
  for (const name of ["Save project", "Reload project", "Preview"]) {
    const bounds = await page
      .getByRole("button", { name, exact: true })
      .boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  await mobileField.fill("Edited on mobile");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("✓ All changes saved");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expect(
    page
      .frameLocator('iframe[title="Website device preview"]')
      .getByRole("img", { name: "Sage landscape" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/m1-preview-mobile.png",
    fullPage: true,
  });
});
