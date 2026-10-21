import { expect, test } from "@playwright/test";
import { fullProject, storageKey } from "./fixtures";

test("device preview changes real media queries while retaining unsaved edits and storage", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, project }) => {
      localStorage.setItem(key, JSON.stringify(project));
    },
    { key: storageKey, project: fullProject },
  );
  const apiCalls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiCalls.push(request.method());
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: fullProject.blocks[0].text, exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Unsaved responsive preview");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Website device preview"]');
  const heading = frame.getByRole("heading", {
    name: "Unsaved responsive preview",
    exact: true,
  });
  for (const preset of [
    { name: "Desktop", width: "1280", padding: "48px", font: "64px" },
    { name: "Tablet", width: "768", padding: "30px", font: "38.4px" },
    { name: "Mobile", width: "390", padding: "24px 20px", font: "39px" },
  ]) {
    const button = page.getByRole("button", { name: preset.name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator('iframe[title="Website device preview"]'),
    ).toHaveAttribute("width", preset.width);
    await expect(heading).toHaveCSS("font-size", preset.font);
    await expect(frame.locator(".document-content")).toHaveCSS(
      "padding",
      preset.padding,
    );
    expect(
      await page.evaluate((key) => localStorage.getItem(key), storageKey),
    ).toBe(JSON.stringify(fullProject));
    await expect(page.locator(".save-status")).toHaveText("● Unsaved changes");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ["Mobile", "Tablet", "Desktop"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    expect(
      (await page.getByRole("button", { name, exact: true }).boundingBox())!
        .height,
    ).toBeGreaterThanOrEqual(44);
  }
  await page
    .getByRole("button", { name: "Back to editor", exact: true })
    .click();
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    "Unsaved responsive preview",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(JSON.stringify(fullProject));
  expect(apiCalls).toEqual([]);
});
