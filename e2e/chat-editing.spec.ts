import { expect, test, type Page } from "@playwright/test";
import { sampleProject, projectSchema } from "../src/project-schema/project";
const key = "siteforge:project:v1:" + sampleProject.id;
const other = { ...sampleProject, id: "chat-other", name: "Other project" };
const otherKey = "siteforge:project:v1:" + other.id;
let apiCalls = 0;
test.beforeEach(async ({ page, context }) => {
  apiCalls = 0;
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) {
      apiCalls++;
      return route.abort();
    }
    return url.origin === "http://127.0.0.1:5189"
      ? route.continue()
      : route.abort();
  });
  await page.addInitScript(
    ({ key, project, otherKey, other }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(project));
      if (!localStorage.getItem(otherKey))
        localStorage.setItem(otherKey, JSON.stringify(other));
    },
    { key, project: sampleProject, otherKey, other },
  );
  await page.goto("/");
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    sampleProject.blocks[0].text,
  );
  await page
    .getByRole("button", { name: "AI chat editing", exact: true })
    .click();
});
test.afterEach(() => expect(apiCalls).toBe(0));
function chat(page: Page) {
  return page.getByRole("region", {
    name: "Mock AI chat editing",
    exact: true,
  });
}
async function propose(page: Page, request: string) {
  await chat(page).getByRole("textbox", { name: "Edit request" }).fill(request);
  await chat(page)
    .getByRole("button", { name: "Create mock proposal", exact: true })
    .click();
}
async function stored(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
}
async function apply(page: Page) {
  await chat(page)
    .getByRole("button", { name: "Preview proposal", exact: true })
    .click();
  await chat(page)
    .getByRole("button", { name: "Apply proposal", exact: true })
    .click();
}
test("update: proposal/preview/reject are read-only, Apply drafts, explicit Save/reload preserves IDs and isolation", async ({
  page,
}) => {
  await propose(page, 'update hero-heading text "Locally reviewed headline"');
  await expect(
    chat(page).getByRole("button", { name: "Apply proposal", exact: true }),
  ).toBeDisabled();
  await chat(page)
    .getByRole("button", { name: "Preview proposal", exact: true })
    .click();
  expect(await stored(page)).toEqual(sampleProject);
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    sampleProject.blocks[0].text,
  );
  await chat(page)
    .getByRole("button", { name: "Reject proposal", exact: true })
    .click();
  expect(await stored(page)).toEqual(sampleProject);
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  await propose(page, 'update hero-heading text "Locally reviewed headline"');
  await apply(page);
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    "Locally reviewed headline",
  );
  await expect(page.locator(".save-status")).toContainText("Unsaved changes");
  expect(await stored(page)).toEqual(sampleProject);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = projectSchema.parse(await stored(page));
  expect(saved.revision).toBe(1);
  expect(saved.blocks.map((b) => b.id)).toEqual(
    sampleProject.blocks.map((b) => b.id),
  );
  expect(saved.blocks[0].text).toBe("Locally reviewed headline");
  expect(
    await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), otherKey),
  ).toEqual(other);
  await page.reload();
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    "Locally reviewed headline",
  );
});
test("add, reorder and remove through separate proposals preserve existing IDs and require Save", async ({
  page,
}) => {
  await propose(
    page,
    'add paragraph after hero-heading {"text":"An explicitly requested paragraph"}',
  );
  await apply(page);
  expect(await stored(page)).toEqual(sampleProject);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const added = projectSchema.parse(await stored(page));
  expect(added.blocks).toHaveLength(3);
  const newId = added.blocks[1].id;
  expect(newId).not.toBe("hero-heading");
  await propose(page, `reorder hero-copy,${newId},hero-heading`);
  await apply(page);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await stored(page)).blocks.map((b: { id: string }) => b.id)).toEqual([
    "hero-copy",
    newId,
    "hero-heading",
  ]);
  await propose(page, `remove ${newId}`);
  await apply(page);
  expect((await stored(page)).blocks).toHaveLength(3);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const removed = projectSchema.parse(await stored(page));
  expect(removed.revision).toBe(3);
  expect(removed.blocks.map((b) => b.id)).toEqual([
    "hero-copy",
    "hero-heading",
  ]);
});
test("manual Puck edits invalidate a reviewed proposal without overwriting the draft", async ({
  page,
}) => {
  await propose(page, 'update hero-heading text "Proposal text"');
  await chat(page)
    .getByRole("button", { name: "Preview proposal", exact: true })
    .click();
  await page
    .getByRole("button", { name: sampleProject.blocks[0].text, exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Manual draft wins");
  await expect(
    chat(page).getByRole("button", { name: "Apply proposal", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    "Manual draft wins",
  );
  expect(await stored(page)).toEqual(sampleProject);
});
test("a concurrent stored revision prevents Apply and preserves both documents", async ({
  page,
}) => {
  await propose(page, 'update hero-heading text "Stale proposal"');
  await chat(page)
    .getByRole("button", { name: "Preview proposal", exact: true })
    .click();
  await page.evaluate((k) => {
    const p = JSON.parse(localStorage.getItem(k)!);
    p.revision++;
    p.blocks[0].text = "Other tab saved";
    localStorage.setItem(k, JSON.stringify(p));
  }, key);
  await chat(page)
    .getByRole("button", { name: "Apply proposal", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Revision conflict" }).first(),
  ).toBeVisible();
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    sampleProject.blocks[0].text,
  );
  expect((await stored(page)).blocks[0].text).toBe("Other tab saved");
});
test("Puck remains editable after an approved proposal remounts the editor", async ({
  page,
}) => {
  await propose(page, 'update hero-heading text "Approved draft"');
  await apply(page);
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    "Approved draft",
  );
  await page
    .getByRole("button", { name: "Approved draft", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Manually refined after Apply");
  expect(await stored(page)).toEqual(sampleProject);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await stored(page)).blocks[0]).toEqual({
    ...sampleProject.blocks[0],
    text: "Manually refined after Apply",
  });
  await page.reload();
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    "Manually refined after Apply",
  );
});

test("invalid command and invalid canonical fields fail without writes", async ({
  page,
}) => {
  await propose(page, 'update hero-heading text ""');
  await expect(chat(page).getByRole("alert")).toBeVisible();
  expect(await stored(page)).toEqual(sampleProject);
  await propose(page, "remove absent-block");
  await expect(chat(page).getByRole("alert")).toBeVisible();
  expect(await stored(page)).toEqual(sampleProject);
});
