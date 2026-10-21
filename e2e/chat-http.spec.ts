import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { Server } from "node:http";
import { createGenerationServer } from "../server/generation-server";
import {
  createMockEditProvider,
  MOCK_EDIT_INSTRUCTION,
} from "../server/edit-provider";
import { projectSchema, sampleProject } from "../src/project-schema/project";

const origin = "http://127.0.0.1:5189";
const key = "siteforge:project:v1:" + sampleProject.id;
const other = {
  ...sampleProject,
  id: "http-chat-other",
  name: "Other HTTP project",
};
const otherKey = "siteforge:project:v1:" + other.id;
let backend: Server | undefined;
let providerCalls = 0;
let completedPosts = 0;
let release: (() => void) | undefined;
let apiPaths: string[] = [];
let blocked: string[] = [];

test.beforeEach(() => {
  backend = undefined;
  providerCalls = 0;
  completedPosts = 0;
  release = undefined;
  apiPaths = [];
  blocked = [];
});
test.afterEach(async () => {
  release?.();
  if (backend) {
    backend.closeAllConnections();
    await new Promise<void>((resolve) => backend!.close(() => resolve()));
  }
  expect(blocked).toEqual([]);
});
function panel(page: Page) {
  return page.getByRole("region", {
    name: "Mock AI chat editing",
    exact: true,
  });
}
async function open(
  page: Page,
  context: BrowserContext,
  options: { disabled?: boolean; held?: boolean; invalidFact?: boolean } = {},
) {
  const fixture = createMockEditProvider();
  backend = createGenerationServer({
    onGenerationEvent: () => {},
    editProvider: options.disabled
      ? undefined
      : createMockEditProvider(async (request, signal) => {
          providerCalls++;
          if (options.held)
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          signal.throwIfAborted();
          if (options.invalidFact)
            return JSON.stringify({
              version: 1,
              operations: [
                {
                  op: "update",
                  blockId: request.context.blocks[0].id,
                  changes: { text: "999 clients" },
                },
              ],
            });
          return fixture.propose(request, signal);
        }),
  });
  await new Promise<void>((resolve) =>
    backend!.listen(0, "127.0.0.1", resolve),
  );
  const address = backend.address();
  if (!address || typeof address === "string")
    throw new Error("Missing owned test address");
  const base = `http://127.0.0.1:${address.port}`;
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin !== origin ||
      (url.pathname.startsWith("/api/") &&
        !url.pathname.startsWith("/api/edit/"))
    ) {
      blocked.push(url.origin + url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  // Browser uses only same-origin URLs; forward them to the real protected synthetic server.
  await page.route("**/api/edit/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    apiPaths.push(route.request().method() + " " + path);
    try {
      const response = await route.fetch({ url: base + path });
      await route.fulfill({ response });
    } catch {
      await route.abort().catch(() => {});
    } finally {
      if (route.request().method() === "POST") completedPosts++;
    }
  });
  await page.addInitScript(
    ({ key, otherKey, project, other }) => {
      if (sessionStorage.getItem("siteforge:http-chat-seeded")) return;
      localStorage.setItem(key, JSON.stringify(project));
      localStorage.setItem(otherKey, JSON.stringify(other));
      sessionStorage.setItem("siteforge:http-chat-seeded", "true");
    },
    { key, otherKey, project: sampleProject, other },
  );
  await page.goto("/");
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    sampleProject.blocks[0].text,
  );
  await page
    .getByRole("button", { name: "AI chat editing", exact: true })
    .click();
}
async function begin(page: Page) {
  await panel(page)
    .getByRole("combobox", { name: "Editing mode" })
    .selectOption("synthetic-http");
  await panel(page)
    .getByRole("textbox", { name: "Edit request" })
    .fill(MOCK_EDIT_INSTRUCTION);
  await panel(page)
    .getByRole("button", {
      name: "Create synthetic mock proposal",
      exact: true,
    })
    .click();
}
async function records(page: Page) {
  return page.evaluate(
    ({ key, otherKey }) => ({
      current: JSON.parse(localStorage.getItem(key)!),
      other: JSON.parse(localStorage.getItem(otherKey)!),
    }),
    { key, otherKey },
  );
}
async function reviewed(page: Page) {
  await expect(
    panel(page).getByRole("region", { name: "Edit proposal", exact: true }),
  ).toBeVisible();
  await expect(
    panel(page).getByRole("button", { name: "Apply proposal", exact: true }),
  ).toBeDisabled();
  await panel(page)
    .getByRole("button", { name: "Preview proposal", exact: true })
    .click();
}
async function editHeading(page: Page, current: string, next: string) {
  await page.getByRole("button", { name: current, exact: true }).click();
  await page.getByRole("textbox", { name: "Text", exact: true }).fill(next);
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    next,
  );
}

test("synthetic HTTP proposal → diff → explicit Preview → Reject or Apply → separate Save/reload preserves IDs and isolation", async ({
  page,
  context,
}) => {
  await open(page, context);
  expect(apiPaths).toEqual([]);
  await expect(
    panel(page).getByRole("combobox", { name: "Editing mode" }),
  ).toHaveValue("deterministic");
  await begin(page);
  await reviewed(page);
  expect(await records(page)).toEqual({ current: sampleProject, other });
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    sampleProject.blocks[0].text,
  );
  await panel(page)
    .getByRole("button", { name: "Reject proposal", exact: true })
    .click();
  expect(await records(page)).toEqual({ current: sampleProject, other });
  await begin(page);
  await reviewed(page);
  await panel(page)
    .getByRole("button", { name: "Apply proposal", exact: true })
    .click();
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    "Welcome",
  );
  await expect(page.locator(".save-status")).toContainText("Unsaved changes");
  expect(await records(page)).toEqual({ current: sampleProject, other });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = projectSchema.parse((await records(page)).current);
  expect(saved.revision).toBe(1);
  expect(saved.blocks.map((block) => block.id)).toEqual(
    sampleProject.blocks.map((block) => block.id),
  );
  expect(saved.blocks[0].text).toBe("Welcome");
  expect((await records(page)).other).toEqual(other);
  await page.reload();
  await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
    "Welcome",
  );
  expect((await records(page)).current).toEqual(saved);
  expect(providerCalls).toBe(2);
  expect(apiPaths).toEqual([
    "GET /api/edit/status",
    "POST /api/edit/propose",
    "GET /api/edit/status",
    "POST /api/edit/propose",
  ]);
});

test("pending synthetic HTTP work exposes Cancel and prevents duplicate submissions", async ({
  page,
  context,
}) => {
  await open(page, context, { held: true });
  await begin(page);
  await expect.poll(() => providerCalls).toBe(1);
  await expect(
    panel(page).getByRole("button", {
      name: "Create synthetic mock proposal",
      exact: true,
    }),
  ).toBeDisabled();
  await panel(page)
    .getByRole("button", { name: "Cancel mock request", exact: true })
    .click();
  release?.();
  await expect.poll(() => completedPosts).toBe(1);
  await expect(
    panel(page).getByRole("region", { name: "Edit proposal", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel(page).getByRole("button", { name: "Apply proposal", exact: true }),
  ).toBeDisabled();
  expect(providerCalls).toBe(1);
  expect(await records(page)).toEqual({ current: sampleProject, other });
});

for (const action of ["manual edit", "Save"] as const) {
  test(`in-flight ${action} wins over a late synthetic HTTP response`, async ({
    page,
    context,
  }) => {
    await open(page, context, { held: true });
    if (action === "Save")
      await editHeading(page, sampleProject.blocks[0].text, "Unsaved baseline");
    await begin(page);
    await expect.poll(() => providerCalls).toBe(1);
    if (action === "Save")
      await page
        .getByRole("button", { name: "Save project", exact: true })
        .click();
    else
      await editHeading(
        page,
        sampleProject.blocks[0].text,
        "Manual draft wins",
      );
    release?.();
    await expect.poll(() => completedPosts).toBe(1);
    await expect(
      panel(page).getByRole("region", { name: "Edit proposal", exact: true }),
    ).toHaveCount(0);
    await expect(
      panel(page).getByRole("button", { name: "Apply proposal", exact: true }),
    ).toBeDisabled();
    const expected =
      action === "Save" ? "Unsaved baseline" : "Manual draft wins";
    await expect(page.locator(".editor-host .hero-title").first()).toHaveText(
      expected,
    );
    const stored = await records(page);
    expect(stored.other).toEqual(other);
    if (action === "Save")
      expect(stored.current).toMatchObject({
        revision: 1,
        blocks: [
          { ...sampleProject.blocks[0], text: expected },
          sampleProject.blocks[1],
        ],
      });
    else expect(stored.current).toEqual(sampleProject);
  });
}

test("project switch discards pending synthetic HTTP output even with overlapping block IDs", async ({
  page,
  context,
}) => {
  await open(page, context, { held: true });
  await begin(page);
  await expect.poll(() => providerCalls).toBe(1);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page
    .getByRole("article", { name: "Project " + other.name, exact: true })
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await expect(page.locator(".projectbar strong")).toHaveText(other.name);
  release?.();
  await expect.poll(() => completedPosts).toBe(1);
  await expect(
    panel(page).getByRole("region", { name: "Edit proposal", exact: true }),
  ).toHaveCount(0);
  expect(await records(page)).toEqual({ current: sampleProject, other });
});

test("instruction change and restoration permanently discard the older HTTP result", async ({
  page,
  context,
}) => {
  await open(page, context, { held: true });
  await begin(page);
  await expect.poll(() => providerCalls).toBe(1);
  await panel(page)
    .getByRole("textbox", { name: "Edit request" })
    .fill("Different instruction");
  await panel(page)
    .getByRole("textbox", { name: "Edit request" })
    .fill(MOCK_EDIT_INSTRUCTION);
  release?.();
  await expect.poll(() => completedPosts).toBe(1);
  await expect(
    panel(page).getByRole("region", { name: "Edit proposal", exact: true }),
  ).toHaveCount(0);
  expect(providerCalls).toBe(1);
  expect(await records(page)).toEqual({ current: sampleProject, other });
});

test("disabled backend never POSTs or falls back automatically; offline commands remain usable", async ({
  page,
  context,
}) => {
  await open(page, context, { disabled: true });
  await begin(page);
  await expect(panel(page).getByRole("alert")).toContainText("disabled");
  await expect(
    panel(page).getByRole("combobox", { name: "Editing mode" }),
  ).toHaveValue("synthetic-http");
  expect(apiPaths).toEqual(["GET /api/edit/status"]);
  expect(providerCalls).toBe(0);
  await panel(page)
    .getByRole("combobox", { name: "Editing mode" })
    .selectOption("deterministic");
  await panel(page)
    .getByRole("textbox", { name: "Edit request" })
    .fill('update hero-heading text "Offline option"');
  await panel(page)
    .getByRole("button", { name: "Create mock proposal", exact: true })
    .click();
  await expect(
    panel(page).getByRole("region", { name: "Edit proposal", exact: true }),
  ).toContainText("Offline option");
  expect(apiPaths).toEqual(["GET /api/edit/status"]);
  expect(await records(page)).toEqual({ current: sampleProject, other });
});

test("host semantic validation rejects ungrounded output after a successful synthetic backend response", async ({
  page,
  context,
}) => {
  await open(page, context, { invalidFact: true });
  await begin(page);
  await expect(panel(page).getByRole("alert")).toContainText(
    "valid synthetic mock proposal",
  );
  await expect(
    panel(page).getByRole("region", { name: "Edit proposal", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel(page).getByRole("button", { name: "Apply proposal", exact: true }),
  ).toBeDisabled();
  expect(providerCalls).toBe(1);
  expect(await records(page)).toEqual({ current: sampleProject, other });
});
