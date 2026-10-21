# M2C live acceptance preparation — ready, NOT live-authorized

## Result and boundary

Ready for a fresh, explicitly approved single-request M2C acceptance attempt. **No real Gemini request was made, no live backend was enabled and no provider key was read/requested.** Existing live approvals are spent. Do not run the live startup block or the `--live-approved` runner until new approval is given.

The M2C source/build fingerprints matched at inspection. Preparation changes only the test harness/scenario selection and adds synthetic test fixtures; application runtime, grounding, prompt v2 and single-request launcher protections remain unchanged. No paid resource, dependency, M3, storage migration or UI redesign was introduced.

Checkpoint: `.milestones/m2c-before-live-acceptance-preparation/`. Full checks/current hashes: [readiness evidence](m2c-live-acceptance-readiness.json).

## Fixed coffee shop scenario

- Model: `gemini-3.5-flash-lite`.
- Website name: `SiteForge Coffee Acceptance`.
- Language: Indonesian; all input is synthetic, with no real business details.
- Exactly three ordered blocks: **Hero → Features/Services → Contact**.
- Hero headline: `Kedai Kopi Uji SiteForge`; synthetic-placeholder subtitle and CTA to Contact.
- Features: title `Pilihan kedai`, grid layout, two items titled `Menu kopi` and `Kunjungan`, descriptions framed as placeholder instructions rather than claims about real offerings.
- Contact: email, phone and address empty. No fake prices, contacts, opening hours, testimonials, credentials or other business facts. No images or external links.

Exact request text is frozen in `scripts/coffee-acceptance-scenario.ts` and covered by the preparation fingerprints:

> Create a synthetic coffee shop website in Indonesian with exactly three blocks in this order: hero, features, contact. Hero id must be intro, headline must be Kedai Kopi Uji SiteForge, subtitle must clearly label this as synthetic placeholder content, ctaText must be Kontak and ctaHref must be #contact. Features id must be services, title must be Pilihan kedai, layout must be grid, with exactly two items titled Menu kopi and Kunjungan. Item descriptions must be placeholder instructions, not claims about real products or services. Contact id must be contact, title must be Kontak, body must be Informasi kontak belum diberikan.; email, phone and address must all be empty strings. Do not add images, external links, prices, phone numbers, addresses, email addresses, opening hours, certifications, testimonials, factual business claims, other blocks or fields.

The shared model instruction remains prompt contract v2. Backend construction and browser acceptance retain strict schema, semantic/grounding, provenance and candidate-identity validation. Synthetic negative fixtures prove copied-contact/price enforcement with `UNSUPPORTED_BUSINESS_FACT`, one provider attempt/transport call, and no reflection of rejected values. These are bounded checks, not universal semantic truth verification.

## Harness changes — not a replacement live launcher

- `scripts/run-smoke-observer.ts` accepts the optional final `--scenario=coffee-shop` selector. Default/no-mode remains disabled. Live still requires `--live-approved` plus an explicit verified PID; malformed, unknown or duplicate flags fail closed. The observer discards its inherited key copy and uses the existing credential-free child environment policy.
- `scripts/coffee-acceptance-scenario.ts` freezes synthetic request/expected shape and mock content.
- `scripts/mock-coffee-smoke.ts` is **mock-only**: clears the inherited key without reading it, forbids native fetch, injects a three-block Gemini-format response into the unchanged `createSmokeServer({}, ["--mock"], transport)` factory. It retains one-attempt and non-refundable transport-budget enforcement. This entrypoint is never used for live mode.
- `playwright.smoke.config.ts` selects that fixture only for coffee mock rehearsal. Future live mode still starts only the fresh production preview and connects to the existing user-owned `server/smoke-start.ts --live` launcher.
- `e2e/smoke-workflow.spec.ts` retains exact-input/single-forwarded-POST guards, the exclusive per-PID live ledger, current-source/build hashes, shared bounded observer, no network traces, and no Save click. Legacy two-block behavior remains selectable by omitting the scenario flag.
- The ledger now records the scenario and coffee acceptance booleans. Fingerprints additionally cover provider adapter, prompt v2, content/grounding schemas, candidate editor and scenario fixture.

`server/smoke-startup.ts`, `server/smoke-start.ts`, `server/smoke-startup.test.ts`, `e2e/generation-observer.ts`, prompt v2/grounding/application runtime, package manifests and lockfile are byte-identical to the preparation checkpoint. No limit was increased: **`maxAttempts: 1`, outbound budget one** for the live launcher. Its lifetime budget is never refunded after failure; restarting is not a permitted retry.

## What acceptance observes

The runner submits the fixed prompt once, then waits for the shared bounded terminal observer. It persists safe generation metadata before later checks/screenshots. For a successful generation it checks:

1. Success, valid schema, one forwarded POST/transport call and three blocks.
2. Rendered component order, Hero/Features/Contact shape, two grid items and CTA anchor remapping.
3. Empty structured contact fields rendered as not provided.
4. Candidate editing before Save: open Puck, change only the synthetic Contact introduction to `Konten uji diedit lokal.`, confirm Save is disabled while editing, Apply back to preview and verify localStorage is unchanged.
5. No Save click or project insertion. Initial generated preview and locally edited preview receive separate screenshots.

Editing is local-only and does not generate a second request. Generation timing in the observation measures generation, not the later editing interaction. On any error the runner stops without retry. A valid generation is not automatically an acceptance pass: require runner exit zero plus `structureConfirmed`, `contactEmptiesConfirmed`, `editingBeforeSaveVerified` and `storageUnchanged` all true. If editing/structure checks fail after generation succeeded, report that partial outcome; do not try another generation.

The existing 105-second observer bound, 135-second test/155-second suite/175-second wrapper bounds and zero Playwright retries remain in place. Live PID ledger names are unchanged across scenarios, so scenario selection cannot reuse a consumed launcher ledger. Never delete a ledger to bypass this guard.

## Verification performed

| Check | Result |
| --- | --- |
| Typecheck / production build | PASS |
| Frontend/domain/UI tests | 112 PASS |
| Server/provider/integration/observer tests | 137 PASS |
| Launcher guard tests | 20 PASS, included in server total |
| Existing + M2C browser suite | 35 PASS |
| Fault/observability browser suite | 18 PASS |
| Browser regression total | 53 PASS |
| Client-bundle safety/sentinel check | PASS |
| Legacy two-block production mock smoke | 1 PASS |
| Coffee production mock acceptance, including editing/no Save | 1 PASS |

Commands: `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run verify:bundle`, `npm run smoke:observe -- --mock`, and `npm run smoke:observe -- --mock --scenario=coffee-shop`.

Latest [coffee mock ledger](smoke-observations/mock-b8f92657-c140-4da5-a15e-8dc4db1728df.json): HTTP 200, `success`, schema valid, three blocks, one synthetic transport, preview visible, acceptance booleans true, storage unchanged, no Save. Server receipt 29 ms; observer 199 ms. These are **mock timings, not predicted Gemini latency**.

- [Initial generated mock preview](smoke-observations/mock-b8f92657-c140-4da5-a15e-8dc4db1728df.png)
- [Locally edited, still unsaved mock preview](smoke-observations/mock-b8f92657-c140-4da5-a15e-8dc4db1728df-edited.png) — visually inspected
- [Legacy mock regression ledger](smoke-observations/mock-5f6440ea-6cff-4cd3-b81f-aee8761ba65d.json)

Source/build fingerprints match those exercised by the latest coffee run. Test-owned backend and preview have been cleaned up; ports **5188 and 5189 are closed**. No unrelated service was stopped. No actual model/account/quota access was probed. Existing operator Free Tier confirmation is not a billing API check.

## Startup — only AFTER new explicit live approval

Do **not** execute this block now. After fresh one-request approval, run it in the PowerShell session that already holds the dedicated SiteForge key; do not display/re-enter/send the key:

```powershell
Set-Location 'C:\Projects\siteforge-ai'
$env:SITEFORGE_BACKEND_PORT = '5188'
$env:SITEFORGE_GEMINI_MODEL = 'gemini-3.5-flash-lite'
$env:SITEFORGE_AI_PROVIDER = 'gemini'
$env:SITEFORGE_AI_TEST_MODE = 'false'
$env:SITEFORGE_SMOKE_FREE_TIER_CONFIRMED = 'true'
$env:SITEFORGE_AI_ALLOW_LIVE = 'true'
try {
    node --import tsx server/smoke-start.ts --live
} finally {
    $env:SITEFORGE_AI_ALLOW_LIVE = 'false'
    Remove-Item Env:SITEFORGE_SMOKE_FREE_TIER_CONFIRMED -ErrorAction SilentlyContinue
}
```

Keep that terminal running and do not manually click Generate or restart. The agent can independently verify the local PID/mode/model/loopback listener and preparation fingerprints, start its own production preview, observe exactly one submission and collect safe evidence. No repeated manual key, billing or status checks are needed.

After new approval and fresh local readiness only, the agent-side command is:

```text
npm run smoke:observe -- --live-approved --pid=<verified-PID> --scenario=coffee-shop
```

The live command is documented, **not executed during preparation**. If a test port is occupied or fingerprints differ, stop before submission rather than killing another service or changing source mid-run. After the final outcome the user-owned launcher may be stopped with Ctrl+C, which allows the supplied `finally` block to restore the disabled live flag. Parent-shell key values are never inspected.

Wait for explicit approval for the one real request. Do not begin M3 or redesign work.
