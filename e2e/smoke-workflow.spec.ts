import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  observeGeneration,
  type GenerationObservation,
} from "./generation-observer";
import { coffeeAcceptance } from "../scripts/coffee-acceptance-scenario";
import { buildWebsitePlanRequestBody } from "../server/website-plan-request";
import { GEMINI_GENERATION_MODEL_ORDER } from "../server/gemini-generation-profile";
const legacyPrompt =
  'Create exactly two blocks: one heading titled "SiteForge smoke test" and one short paragraph saying this is synthetic test content. Do not include links, images, contact details, prices, or factual business claims.';
const premiumCafe = {
  name: "Kedai Kopi Premium Manado",
  prompt:
    "Buat website coffee shop premium di Manado dalam Bahasa Indonesia: modern, elegan, minimalis, dan mobile-friendly. Gunakan tepat enam blok dengan urutan: hero, image untuk foto hero, features bergaya menu, image bergaya gallery, section tentang café, contact. Jangan mengarang menu nyata, harga, alamat, jam buka, nomor telepon, email, klaim, ulasan, atau sertifikasi. Labeli nama item menu sebagai placeholder, kosongkan harga dan informasi kontak yang belum diberikan, serta gunakan hanya placeholder gambar lokal yang tersedia.",
};
test("one guarded synthetic submission with current frontend, backend and bounded observer", async ({
  page,
  context,
}) => {
  const mode = process.env.SITEFORGE_OBSERVER_MODE;
  const scenario =
    process.env.SITEFORGE_OBSERVER_SCENARIO ?? "smoke-two-blocks";
  expect(["smoke-two-blocks", "coffee-shop", "premium-cafe"]).toContain(
    scenario,
  );
  const coffee = scenario === "coffee-shop";
  const name =
    scenario === "coffee-shop"
      ? coffeeAcceptance.name
      : scenario === "premium-cafe"
        ? premiumCafe.name
        : "SiteForge Smoke Test";
  const prompt =
    scenario === "coffee-shop"
      ? coffeeAcceptance.prompt
      : scenario === "premium-cafe"
        ? premiumCafe.prompt
        : legacyPrompt;
  expect([
    "mock",
    "mock-routed",
    "live-approved",
    "live-routed-approved",
  ]).toContain(mode);
  const live = mode === "live-approved" || mode === "live-routed-approved";
  const routed = mode === "mock-routed" || mode === "live-routed-approved";
  const model = routed
    ? GEMINI_GENERATION_MODEL_ORDER[0]
    : "gemini-3.5-flash-lite";
  const models = routed ? [...GEMINI_GENERATION_MODEL_ORDER] : [model];
  const outboundLimit = routed ? 2 : 1;
  const pid = process.env.SITEFORGE_OBSERVER_PID;
  if (live) expect(pid).toMatch(/^[1-9][0-9]{0,9}$/);
  const folder = resolve("docs/smoke-observations");
  mkdirSync(folder, { recursive: true });
  const recordPath = resolve(
    folder,
    live ? "launcher-" + pid + ".json" : "mock-" + randomUUID() + ".json",
  );
  const fingerprints = Object.fromEntries(
    [
      "dist/index.html",
      ...readdirSync(resolve("dist/assets"))
        .filter((file) => /\.(?:js|css)$/.test(file))
        .sort()
        .map((file) => "dist/assets/" + file),
      "src/ai/website-plan.ts",
      "server/website-plan-request.ts",
      "server/smoke-transport-audit.ts",
      "server/smoke-start.ts",
      "server/generation-server.ts",
      "server/gemini-provider.ts",
      "server/provider-error.ts",
      "server/gemini-request-contract.ts",
      "server/provider-rpc-status.ts",
      "src/ai/generation-validation.ts",
      "src/ai/provider-http.ts",
      "src/ai/generation-observation.ts",
      "server/generation-prompt.ts",
      "src/ai/generation-content.ts",
      "src/ai/generation-grounding.ts",
      "src/ai/website-generation.ts",
      "src/project-schema/project.ts",
      "src/app/CandidateEditor.tsx",
      "scripts/coffee-acceptance-scenario.ts",
      "scripts/mock-coffee-smoke.ts",
      "server/smoke-startup.ts",
      "server/gemini-generation-profile.ts",
      "server/routed-generation-provider.ts",
      "server/model-router.ts",
      "server/model-router-config.ts",
      "server/gemini-model-catalog.ts",
      "src/ai/model-routing.ts",
      "src/ai/generation-client.ts",
      "src/app/WebsiteGenerator.tsx",
      "e2e/generation-observer.ts",
      "e2e/smoke-workflow.spec.ts",
      "scripts/run-smoke-observer.ts",
      "playwright.smoke.config.ts",
    ].map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(resolve(file)))
        .digest("hex"),
    ]),
  );
  const record: {
    scenario: string;
    structureConfirmed: boolean | null;
    contactEmptiesConfirmed: boolean | null;
    editingBeforeSaveVerified: boolean | null;
    editingScreenshot: string | null;
    mode: string | undefined;
    model: string;
    models: string[];
    outboundLimit: number;
    launcherPid: string | null;
    state: string;
    fingerprints: Record<string, string>;
    generationContract: "website-plan-v1";
    requestBodySha256: string;
    providerHttpStatus: number | null;
    guardedPosts: number;
    observation: GenerationObservation | null;
    storageUnchanged: boolean | null;
    saveClicked: false;
    screenshot: string | null;
  } = {
    scenario,
    structureConfirmed: coffee ? false : null,
    contactEmptiesConfirmed: coffee ? false : null,
    editingBeforeSaveVerified: coffee ? false : null,
    editingScreenshot: null,
    mode,
    model,
    models,
    outboundLimit,
    launcherPid: live ? pid! : null,
    state: "prepared",
    fingerprints,
    generationContract: "website-plan-v1",
    requestBodySha256: createHash("sha256")
      .update(buildWebsitePlanRequestBody({ name, prompt }))
      .digest("hex"),
    providerHttpStatus: null,
    guardedPosts: 0,
    observation: null,
    storageUnchanged: null,
    saveClicked: false,
    screenshot: null,
  };
  const expectedBlockCount =
    scenario === "coffee-shop" ? 3 : scenario === "premium-cafe" ? 6 : 2;
  // Exclusive ledger precedes submission. Never reuse a live PID ledger or retry a run.
  writeFileSync(recordPath, JSON.stringify(record, null, 2), {
    flag: "wx",
    flush: true,
  });
  const persist = () =>
    writeFileSync(recordPath, JSON.stringify(record, null, 2), { flush: true });
  try {
    if (live) {
      const command = `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; $c=@(Get-NetTCPConnection -LocalPort 5188 -State Listen -ErrorAction SilentlyContinue); [pscustomobject]@{pid=$p.ProcessId;isLauncher=($p.Name -eq 'node.exe' -and $p.CommandLine -match 'smoke-start\\.ts.*--live${routed ? "-routed" : ""}\\s*$');ownsPort=($c.OwningProcess -contains ${pid});loopback=($c.LocalAddress -contains '127.0.0.1')} | ConvertTo-Json -Compress`;
      const identity = JSON.parse(
        execFileSync("powershell.exe", ["-NoProfile", "-Command", command], {
          encoding: "utf8",
          timeout: 10000,
        }),
      );
      // Assert only booleans, never raw process command lines or credentials.
      expect(
        identity.isLauncher === true &&
          identity.ownsPort === true &&
          identity.loopback === true,
      ).toBe(true);
      const audit = JSON.parse(
        readFileSync(resolve(folder, `transport-${pid}.json`), "utf8"),
      );
      expect(audit).toMatchObject({
        pid: Number(pid),
        contract: "website-plan-v1",
        model,
        models,
        routed,
        outboundLimit,
        transportCalls: 0,
        stopped: false,
      });
      for (const [file, hash] of Object.entries(audit.sourceFingerprints))
        expect(fingerprints[file]).toBe(hash);
    }
    const response = await fetch(
      "http://127.0.0.1:5188/api/generation/status",
      { signal: AbortSignal.timeout(5000) },
    );
    const status = await response.json();
    expect(response.status).toBe(200);
    expect(status.mode).toBe(live ? "live" : "mock");
    expect(status.model).toBe(model);
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== "http://127.0.0.1:5189") {
        await route.abort();
        return;
      }
      if (url.pathname === "/api/generate") {
        let data;
        try {
          data = request.postDataJSON();
        } catch {
          await route.abort();
          return;
        }
        if (
          request.method() !== "POST" ||
          record.guardedPosts !== 0 ||
          data?.name !== name ||
          data?.prompt !== prompt ||
          Object.keys(data).sort().join(",") !== "name,prompt"
        ) {
          await route.abort();
          return;
        }
        record.guardedPosts = 1;
        record.state = "submission-forwarded";
        persist();
      }
      await route.continue();
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Generate website", exact: true })
      .click();
    const panel = page.getByRole("region", {
      name: "Website generator",
      exact: true,
    });
    // Refuse stale pre-observability UI before any generation POST.
    await expect(panel).toHaveAttribute("data-generation-state", "idle");
    const storage = await page.evaluate(() =>
      JSON.stringify(
        Object.fromEntries(
          Object.keys(localStorage)
            .sort()
            .map((key) => [key, localStorage.getItem(key)]),
        ),
      ),
    );
    await panel.getByLabel("Website name").fill(name);
    await panel.getByLabel("Website prompt").fill(prompt);
    record.observation = await observeGeneration(page, {
      timeoutMs: 105000,
      onProgress: (observation) => {
        record.observation = observation;
        record.state = observation.phase;
        persist();
      },
    });
    record.storageUnchanged =
      storage ===
      (await page.evaluate(() =>
        JSON.stringify(
          Object.fromEntries(
            Object.keys(localStorage)
              .sort()
              .map((key) => [key, localStorage.getItem(key)]),
          ),
        ),
      ));
    persist();
    // Observation is durable before screenshot/cleanup; those cannot erase the result.
    const screenshot = recordPath.replace(/\.json$/, ".png");
    await panel.screenshot({ path: screenshot, timeout: 5000 });
    record.screenshot = screenshot;
    persist();
    expect(record.observation.phase).toBe("terminal");
    expect(record.guardedPosts).toBe(1);
    expect(record.observation.generationPosts).toBe(1);
    expect(record.storageUnchanged).toBe(true);
    expect(record.observation).toMatchObject({
      uiState: "success",
      schemaValidation: "valid",
      blockCount: expectedBlockCount,
      candidatePreview: true,
    });
    expect(record.observation.transportCalls).toBeGreaterThanOrEqual(1);
    expect(record.observation.transportCalls).toBeLessThanOrEqual(
      outboundLimit,
    );
    if (mode === "mock-routed")
      expect(record.observation.transportCalls).toBe(2);
    if (coffee) {
      const preview = panel.getByRole("region", {
        name: "Candidate preview",
        exact: true,
      });
      await expect(preview.locator(".hero-block")).toHaveCount(1);
      await expect(preview.locator(".feature-items.layout-grid")).toHaveCount(
        1,
      );
      await expect(preview.locator(".feature-items article")).toHaveCount(2);
      await expect(preview.locator(".contact-block")).toHaveCount(1);
      await expect(preview.locator(".site-image")).toHaveCount(0);
      await expect(
        preview.getByRole("heading", {
          name: "Kedai Kopi Uji SiteForge",
          exact: true,
        }),
      ).toBeVisible();
      for (const title of ["Pilihan kedai", "Menu kopi", "Kunjungan"])
        await expect(
          preview.getByRole("heading", { name: title, exact: true }),
        ).toBeVisible();
      const contactId = await preview
        .locator(".contact-block")
        .getAttribute("id");
      const order = await preview
        .locator(".site-page .document-content")
        .evaluate((root) =>
          Array.from(root.children).map((element) =>
            element.matches(".hero-block")
              ? "hero"
              : element.querySelector(".feature-items")
                ? "features"
                : element.matches(".contact-block")
                  ? "contact"
                  : "unsupported",
          ),
        );
      expect(order).toEqual([...coffeeAcceptance.blockTypes]);
      expect(contactId).toBeTruthy();
      await expect(preview.locator(".hero-block a")).toHaveAttribute(
        "href",
        "#" + contactId,
      );
      record.structureConfirmed = true;
      persist();
      for (const label of [
        "Email not provided",
        "Phone not provided",
        "Address not provided",
      ])
        await expect(preview.getByText(label, { exact: true })).toBeVisible();
      record.contactEmptiesConfirmed = true;
      persist();
      await panel
        .getByRole("button", {
          name: "Edit candidate before saving",
          exact: true,
        })
        .click();
      const editor = panel.getByRole("region", {
        name: "Candidate editor",
        exact: true,
      });
      await editor
        .getByRole("button")
        .filter({ has: page.locator(".contact-block") })
        .first()
        .click();
      await editor
        .getByRole("textbox", { name: "Contact introduction", exact: true })
        .fill("Konten uji diedit lokal.");
      await expect(
        panel.getByRole("button", {
          name: "Save candidate as new project",
          exact: true,
        }),
      ).toBeDisabled();
      await editor.getByText("Apply candidate edits", { exact: true }).click();
      await expect(editor).toHaveCount(0);
      await expect(
        preview.getByText("Konten uji diedit lokal.", { exact: true }),
      ).toBeVisible();
      record.storageUnchanged =
        storage ===
        (await page.evaluate(() =>
          JSON.stringify(
            Object.fromEntries(
              Object.keys(localStorage)
                .sort()
                .map((key) => [key, localStorage.getItem(key)]),
            ),
          ),
        ));
      expect(record.storageUnchanged).toBe(true);
      record.editingBeforeSaveVerified = true;
      persist();
      const editedScreenshot = recordPath.replace(/\.json$/, "-edited.png");
      await panel.screenshot({ path: editedScreenshot, timeout: 5000 });
      record.editingScreenshot = editedScreenshot;
      persist();
    }
  } catch {
    if (
      record.state !== "terminal" &&
      record.state !== "observer_timeout" &&
      record.state !== "observer_error"
    )
      record.state = "local-runner-error";
    persist();
    throw new Error(
      "Smoke observer stopped; consult its allowlisted ledger. No retry is permitted.",
    );
  } finally {
    if (live) {
      try {
        const audit = JSON.parse(
          readFileSync(resolve(folder, `transport-${pid}.json`), "utf8"),
        );
        if (
          audit.pid === Number(pid) &&
          Number.isInteger(audit.providerStatus) &&
          audit.providerStatus >= 100 &&
          audit.providerStatus <= 599
        )
          record.providerHttpStatus = audit.providerStatus;
      } catch {
        /* Unknown remains null; never retry for missing audit evidence. */
      }
    }
    persist();
    console.log(
      JSON.stringify({
        evidence: recordPath,
        state: record.state,
        mode: record.mode,
        forwarded: record.guardedPosts,
        observation: record.observation,
      }),
    );
  }
});
