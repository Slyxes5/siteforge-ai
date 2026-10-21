# M1 verification — Editable Website Engine

## Scope and preservation

All intentional file changes are under `C:\Projects\siteforge-ai`. No unrelated project was edited, restarted, migrated or deployed. The working directory was not a Git repository; an M0 source snapshot was created at `.milestones/m0-before-m1/` before implementation. This snapshot does not include browser storage and must not be described as a user-data backup.

Project Schema v1 and its localStorage key remain canonical. No existing browser data was migrated or overwritten automatically. Browser tests ran with a separate temporary Chrome profile under `.browser-temp/`, not the user's real Chrome profile. The existing local dev server at port 5178 was verified to serve M1. E2E used a separate strict loopback production-preview server on port 5189 and stopped it after testing.

## Final executed quality gates

| Gate | Actual result |
| --- | --- |
| `npm run typecheck` | Passed, including source, unit tests, Playwright config and E2E source |
| `npm test` | 8 files passed; 21 tests passed |
| `npm run test:e2e` | Rebuilt production output successfully, then 9 browser tests passed |
| E2E result JSON | 9 expected, 0 unexpected, 0 skipped, 0 flaky |
| `npm audit` | 0 vulnerabilities at execution time |
| `npm ls --depth=0` | No peer dependency error reported |
| Secret-pattern scan | No checked secret patterns found in first-party TS/TSX/HTML/JSON or emitted JS |
| Local development endpoint | HTTP 200; M1 workspace module and hook served on 5178 |

The secret scan checked common OpenAI/Google key shapes and private-key headers. It is a targeted check, not a claim that regex scanning guarantees all possible secrets are absent. No credentials or AI provider were introduced.

## Browser E2E evidence

Tests use actual Puck 0.23.0, real production assets and real browser localStorage. No Puck mock or fabricated provider response is used.

1. Edit each of Heading, Paragraph, Button, Image, Hero and Section through Puck fields, save, compare all six complete canonical blocks (including untouched properties), preview and refresh.
2. Decline then accept the unsaved-discard confirmation for Reload; verify the respective draft/saved content.
3. Inject a quota-style Storage write failure in the isolated test browser; confirm error feedback, retained draft and untouched saved content.
4. Simulate another saved revision; confirm the stale draft is rejected without replacing the other revision.
5. Enter invalid required text; confirm Save/Preview pause, then recover after correction.
6. Seed corrupt test storage; confirm load error, save lock and preservation of the exact corrupt value.
7. At 390 × 844, verify no document-width overflow, visible canvas intersection, actual mobile field editing and save, computed input font at least 16px, top-level touch targets at least 44px, and rendered preview/image.
8. Drag a Button from Puck's block palette into the canvas, save the inserted canonical block, delete it through Puck controls and observe unsaved status.
9. Edit → Live Preview → full Preview → Save → Reload → browser refresh, with stored schema validation and no page exception in that flow.

Unit tests cover legacy v1 compatibility, all six variants, supported-property/ID/order/metadata round trips, unknown data rejection, reserved property rejection, safe text/URL rendering, save/reload UI, corruption handling, storage round trips and revision conflicts, plus existing structured-change tests.

## Issues found and resolved

- Initial E2E used `getByLabel` where Puck exposes an accessible textbox name, and direct-child selectors where Puck inserts editing wrappers. Role-based locators fixed the tests; no editor mock was introduced.
- Puck serializes select values internally. The Section theme test selects the visible option label rather than assuming its DOM value.
- Screenshot review caught a collapsed mobile canvas despite an earlier page-width assertion passing. Browser geometry showed an approximately 26px preview frame caused by percentage height without a definite parent. The official `height={800}` prop resolved it; the test now verifies canvas viewport intersection and actual mobile editing.
- Mobile top actions were initially 38px high. A failing geometry assertion preceded a narrow mobile CSS fix setting a 44px minimum.
- Adapter review found that a reserved `props.type` could be overwritten during flattening. A regression test failed before explicit rejection was added. Unknown properties are never intentionally discarded.
- Rendering transient Puck URLs is now guarded separately from accepting the canonical document, because editor rendering happens while a user types invalid input.

## Files

### New implementation and test files

- `src/editor/VisualEditor.tsx`
- `src/editor/project-adapter.ts`, `src/editor/project-adapter.test.ts`
- `src/app/use-project-workspace.ts`, `src/app/workspace.test.tsx`
- `src/project-schema/m1-schema.test.ts`
- `src/renderer/safe-url.ts`, `src/renderer/safe-url.test.ts`
- `public/sample-landscape.svg`
- `playwright.config.ts`
- `e2e/fixtures.ts`, `e2e/engine.spec.ts`, `e2e/insertion.spec.ts`, `e2e/workspace.spec.ts`
- This report and `docs/screenshots/m1-*.png`

### Functional/configuration/documentation changes

- `src/project-schema/project.ts`: additive v1 variants, URL validation, original M0 document shape preserved.
- `src/editor/puck-config.tsx`: six official component definitions.
- `src/app/App.tsx`, `src/app/App.test.tsx`: editable workspace, status/errors, save/reload and canonical previews.
- `src/styles.css`, `src/test-setup.ts`: responsive shell, touch targets, real ResizeObserver polyfill for JSDOM and matchMedia test shim.
- `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`: project-local tools, reproducible dependencies, E2E command, expanded typecheck, source-only Vitest discovery and artifact exclusions.
- `README.md`, `docs/architecture.md`: current usage, data flow, compatibility and limits.

Other existing TS/TSX files were formatted with project-local Prettier without intentional behavior changes, including `src/ai/*`, `src/main.tsx`, existing persistence files/tests, the original schema test and `src/renderer/ProjectRenderer.tsx`. `.npmrc`, `index.html` and the historical M0 verification report were not intentionally changed.

## Screenshots

Screenshots are real Playwright captures from isolated test fixtures, not user documents:

- `docs/screenshots/m1-editor-desktop.png`
- `docs/screenshots/m1-preview-desktop.png`
- `docs/screenshots/m1-six-block-preview.png`
- `docs/screenshots/m1-editor-mobile.png`
- `docs/screenshots/m1-preview-mobile.png`

Desktop editor, six-block preview and mobile screenshots were visually inspected. This is basic responsive QA at the tested viewport sizes, not comprehensive cross-browser, physical-touch-device or accessibility certification.

## Remaining limitations

- Hero and Section are standalone flat blocks, not nested containers.
- Single starter project/page; no project manager or JSON import/export.
- Image URL editing only; no media upload or asset manager.
- No auto-save or durable recovery for unsaved drafts after tab/browser loss.
- Revision checks are best-effort localStorage read/check/write, not atomic cross-tab transactions or collaborative editing.
- Puck's transitive `deep-diff@1.0.2` remains deprecated; npm audit reports no vulnerability at this check. Do not apply an unverified override automatically.
- Puck/editor dependencies produce a substantial bundle. No performance benchmark or optimization milestone is claimed.
- No AI API, payments, authentication, production database, cloud deployment or generated-code execution.

M1 is complete within this scope. M2 requires explicit user approval; no M2 implementation was started.
