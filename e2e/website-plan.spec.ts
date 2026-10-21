import { expect, test } from "@playwright/test";
import { projectSchema } from "../src/project-schema/project";
import { createGenerationServer } from "../server/generation-server";
import { createMockPlanProvider } from "../server/mock-website-plan";

const backend = createGenerationServer({
  provider: createMockPlanProvider(),
  onGenerationEvent: () => {},
});
let backendBase = "";
test.beforeAll(async () => {
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const address = backend.address();
  if (!address || typeof address === "string")
    throw new Error("Missing isolated backend");
  backendBase = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  backend.closeAllConnections();
  await new Promise<void>((resolve) => backend.close(() => resolve()));
});

// Actual loopback mock backend -> Website Plan -> compiler -> browser acceptance.
// Context storage is isolated; never connects to the user's running frontend on 5178.
test("Website Plan backend compiles five categories; explicit saves survive reload without replacing earlier projects", async ({
  page,
  context,
}) => {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      ["5188", "5189"].includes(url.port)
      ? route.continue()
      : route.abort();
  });
  const ids: string[] = [];
  await page.goto("/");
  // Dedicated server isolates the unchanged five-request rate budget from earlier suites.
  // Forward the actual HTTP request/response; do not synthesize a candidate in the browser test.
  await page.route("**/api/**", async (route) => {
    const response = await route.fetch({
      url: backendBase + new URL(route.request().url()).pathname,
    });
    await route.fulfill({ response });
  });
  for (const category of [
    "coffee shop",
    "barbershop",
    "rental mobil",
    "portfolio",
    "business",
  ]) {
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
          " website. Unknown contact details must be empty.",
      );
    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/generate") && r.request().method() === "POST",
    );
    await panel
      .getByRole("button", { name: "Generate candidate", exact: true })
      .click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const result = await response.json();
    const candidate = projectSchema.parse(result.candidate);
    expect(candidate.schemaVersion).toBe(1);
    expect(candidate.blocks.some((b) => b.type === "hero")).toBe(true);
    expect(candidate.blocks.some((b) => b.type === "features")).toBe(true);
    expect(candidate.blocks.find((b) => b.type === "contact")).toMatchObject({
      email: "",
      phone: "",
      address: "",
    });
    await expect(
      panel.getByRole("region", { name: "Candidate preview", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        (id) => localStorage.getItem("siteforge:project:v1:" + id),
        candidate.id,
      ),
    ).toBeNull();
    await panel
      .getByRole("button", {
        name: "Save candidate as new project",
        exact: true,
      })
      .click();
    ids.push(candidate.id);
    expect(
      await page.evaluate(
        (id) => JSON.parse(localStorage.getItem("siteforge:project:v1:" + id)!),
        candidate.id,
      ),
    ).toEqual(candidate);
    page.once("dialog", (dialog) => dialog.accept());
    await panel
      .getByRole("button", { name: "Open candidate in editor", exact: true })
      .click();
    await page.reload();
    await expect(page.locator(".projectbar strong")).toHaveText(candidate.name);
    await expect(page.locator(".editor-host .contact-block")).toBeVisible();
    for (const id of ids)
      expect(
        await page.evaluate(
          (key) => localStorage.getItem("siteforge:project:v1:" + key),
          id,
        ),
      ).not.toBeNull();
  }
  expect(new Set(ids).size).toBe(5);
  await page.screenshot({
    path: "test-results/website-plan-backend-editor.png",
    fullPage: true,
  });
});
