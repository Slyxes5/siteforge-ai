import { expect, test, type Locator, type Page } from "@playwright/test";
import { sampleProject, type Project } from "../src/project-schema/project";

const origin = "http://127.0.0.1:5189";
const prefix = "siteforge:project:v1:";
const first: Project = {
  ...sampleProject,
  id: "chat-context-first",
  name: "Chat context first",
};
// Keep the same block IDs: a leaked operation would be valid for the wrong project.
const second: Project = {
  ...sampleProject,
  id: "chat-context-second",
  name: "Chat context second",
  blocks: sampleProject.blocks.map((block) => ({
    ...block,
    text:
      block.id === "hero-heading" ? "Second project's own heading" : block.text,
  })),
};
const records = {
  [prefix + first.id]: JSON.stringify(first),
  [prefix + second.id]: JSON.stringify(second),
};
const blockedRequests = new WeakMap<Page, string[]>();

function chat(page: Page) {
  return page.getByRole("region", {
    name: "Mock AI chat editing",
    exact: true,
  });
}

async function openChat(page: Page) {
  if (!(await chat(page).isVisible())) {
    await page
      .getByRole("button", { name: "AI chat editing", exact: true })
      .click();
  }
  await expect(chat(page)).toBeVisible();
  return chat(page);
}

async function expectStorageUnchanged(page: Page) {
  expect(
    await page.evaluate(
      (keys) =>
        Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])),
      Object.keys(records),
    ),
  ).toEqual(records);
}

async function expectNoUsableProposal(panel: Locator) {
  // Clearing controls and retaining disabled controls are both safe invalidations.
  await expect(
    panel
      .getByRole("button", { name: "Preview proposal", exact: true })
      .and(panel.locator(":enabled")),
  ).toHaveCount(0);
  await expect(
    panel
      .getByRole("button", { name: "Apply proposal", exact: true })
      .and(panel.locator(":enabled")),
  ).toHaveCount(0);
}

async function propose(page: Page, reviewed: boolean) {
  const panel = await openChat(page);
  await panel
    .getByRole("textbox", { name: "Edit request", exact: true })
    .fill('update hero-heading text "First project proposal must not leak"');
  await panel
    .getByRole("button", { name: "Create mock proposal", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Preview proposal", exact: true }),
  ).toBeEnabled();
  if (reviewed) {
    await panel
      .getByRole("button", { name: "Preview proposal", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "Apply proposal", exact: true }),
    ).toBeEnabled();
  }
  await expectStorageUnchanged(page);
  return panel;
}

async function openProject(page: Page, project: Project) {
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page
    .getByRole("region", { name: "Projects", exact: true })
    .getByRole("article", { name: `Project ${project.name}`, exact: true })
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await expect(page.locator(".projectbar strong")).toHaveText(project.name);
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    project.blocks[0].text,
  );
}

test.beforeEach(async ({ page, context }) => {
  const blocked: string[] = [];
  blockedRequests.set(page, blocked);
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || /^\/api(?:\/|$)/.test(url.pathname)) {
      blocked.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  await page.addInitScript((seed) => {
    // Seed once, not on every reload: never hide accidental writes or deletions.
    const marker = "chat-context-seeded";
    if (sessionStorage.getItem(marker)) return;
    for (const [key, value] of Object.entries(seed))
      localStorage.setItem(key, value);
    sessionStorage.setItem(marker, "yes");
  }, records);
  await page.goto(`/?project=${first.id}`);
  await expect(page.locator(".projectbar strong")).toHaveText(first.name);
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    first.blocks[0].text,
  );
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  await expectStorageUnchanged(page);
});

test.afterEach(async ({ page }) => {
  expect(
    blockedRequests.get(page),
    "Mock chat must make no API or external requests",
  ).toEqual([]);
});

for (const reviewed of [false, true]) {
  const stage = reviewed ? "reviewed" : "unreviewed";

  test(`${stage} proposal cannot revive after invalid Puck text is restored`, async ({
    page,
  }) => {
    const panel = await propose(page, reviewed);
    await page
      .getByRole("button", { name: first.blocks[0].text, exact: true })
      .click();
    const text = page.getByRole("textbox", { name: "Text", exact: true });
    await text.fill("");
    await expect(
      page.getByRole("alert").filter({ hasText: "Invalid editor data" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save project", exact: true }),
    ).toBeDisabled();
    await expect(
      panel.getByRole("button", { name: "Create mock proposal", exact: true }),
    ).toBeDisabled();
    await expectNoUsableProposal(panel);
    await expectStorageUnchanged(page);

    // Returning to the identical canonical snapshot must not resurrect old review consent.
    await text.fill(first.blocks[0].text);
    await expect(
      page.getByRole("alert").filter({ hasText: "Invalid editor data" }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole("button", { name: "Create mock proposal", exact: true }),
    ).toBeEnabled();
    await expectNoUsableProposal(panel);
    await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
      first.blocks[0].text,
    );
    await expect(page.locator(".save-status")).toContainText(
      "All changes saved",
    );
    await expectStorageUnchanged(page);

    // Recovery requires an explicit new proposal and a new review.
    await panel
      .getByRole("textbox", { name: "Edit request", exact: true })
      .fill('update hero-heading text "Fresh request after correction"');
    await panel
      .getByRole("button", { name: "Create mock proposal", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "Apply proposal", exact: true }),
    ).toBeDisabled();
    await panel
      .getByRole("button", { name: "Preview proposal", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "Apply proposal", exact: true }),
    ).toBeEnabled();
    await expectStorageUnchanged(page);
  });

  test(`switching projects discards a ${stage} proposal even when block IDs overlap`, async ({
    page,
  }) => {
    await propose(page, reviewed);
    await openProject(page, second);
    let panel = await openChat(page);
    await expect(
      panel.getByRole("textbox", { name: "Edit request", exact: true }),
    ).toHaveValue("");
    await expectNoUsableProposal(panel);
    await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
      second.blocks[0].text,
    );
    await expect(page.locator(".save-status")).toContainText(
      "All changes saved",
    );
    await expect(
      page.getByRole("button", { name: "Save project", exact: true }),
    ).toBeDisabled();
    await expectStorageUnchanged(page);

    // Switching back must not cache and resurrect the first project's proposal either.
    await openProject(page, first);
    panel = await openChat(page);
    await expect(
      panel.getByRole("textbox", { name: "Edit request", exact: true }),
    ).toHaveValue("");
    await expectNoUsableProposal(panel);
    await expect(page.locator(".save-status")).toContainText(
      "All changes saved",
    );
    await expectStorageUnchanged(page);
  });

  test(`workspace Reload cancels a ${stage} proposal without changing saved projects`, async ({
    page,
  }) => {
    await propose(page, reviewed);
    // Exercise the in-app generation reset, not merely a full browser navigation.
    await page
      .getByRole("button", { name: "Reload project", exact: true })
      .click();
    await expect(page.locator(".workspace-notice")).toHaveText(
      "Saved project reloaded.",
    );
    const panel = await openChat(page);
    await expect(
      panel.getByRole("textbox", { name: "Edit request", exact: true }),
    ).toHaveValue("");
    await expectNoUsableProposal(panel);
    await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
      first.blocks[0].text,
    );
    await expect(page.locator(".save-status")).toContainText(
      "All changes saved",
    );
    await expectStorageUnchanged(page);
    await openProject(page, second);
    await expectNoUsableProposal(await openChat(page));
    await expectStorageUnchanged(page);
  });
}
