import { test, expect } from "@playwright/test";
test("inserts and removes a block using Puck visual controls", async ({
  page,
}) => {
  await page.goto("/");
  const palette = page.getByRole("button", { name: "Button", exact: true });
  const canvas = page.locator(".editor-host .document-content");
  await expect(canvas).toBeVisible();
  const from = await palette.boundingBox();
  const to = await canvas.boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from!.x + from!.width / 2 + 12,
    from!.y + from!.height / 2,
    { steps: 5 },
  );
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height - 15, {
    steps: 30,
  });
  await page.mouse.up();
  await expect(page.locator(".editor-host .site-button")).toHaveCount(1);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("siteforge:project:v1:siteforge-starter")!),
  );
  expect(stored.blocks).toHaveLength(3);
  expect(
    stored.blocks.some((block: { type: string }) => block.type === "button"),
  ).toBe(true);
  await page.getByRole("button", { name: /^Get in touch/ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".editor-host .site-button")).toHaveCount(0);
  await expect(page.locator(".save-status")).toContainText("Unsaved changes");
});
