# SiteForge AI

M3 Phase 2B — structured chat editing, retaining the M0–M2C engine. React, TypeScript, Vite, Tailwind, Zod and Puck. Stage 3B connects the OpenRouter editing adapter to the backend and UI behind independent server activation and explicit content consent. Development verification uses synthetic responses. One approved live editing smoke succeeded through Preview, Apply, Save and reload on 21 October 2026; that one-request approval is spent. See [live editing evidence and launcher](docs/m3-phase2b-live-edit-smoke.md).

See [Stage 3B integration, verification and activation boundaries](docs/m3-phase2b-stage3b.md) and the historical [M3 mock editing workflow](docs/m3-phase1.md). Open **AI chat editing** for Request → Proposal → Preview → Apply/Reject → explicit **Save project**. Offline commands remain the default and need no backend or API key. Selecting **AI editing (OpenRouter)** requires content consent and an explicitly enabled backend; choosing the mode alone never sends a request.

See [M2C capabilities, verification and limits](docs/m2c-verification.md), [implementation plan](docs/m2c-plan.md), and [machine-readable evidence](docs/m2c-verification.json).

## Run

Verified environment: Node 24.21.0, npm 11.19.0. Vite 8 requires Node `^20.19.0 || >=22.12.0`.

```bash
npm ci
npm run dev -- --port 5178 --strictPort
```

Open http://127.0.0.1:5178. Use an unoccupied port; never stop another project's server. This app binds to loopback only.

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run verify:bundle
npm audit
```

`test:e2e` rebuilds production output, starts a temporary mock-only backend on loopback port 5188 and preview on 5189, runs Playwright, and stops both test servers. Both ports must be free. The mock bootstrap clears any inherited Gemini key and disables live requests. It uses the installed Google Chrome in headless mode with an isolated temporary profile inside `.browser-temp/`; it does not reuse, close or modify your everyday Chrome profile. Chrome must be installed and port 5189 must be free. No browser or system-wide install is performed by the test command. Tests never connect to your real browser storage.

## Website generation — mock verified, live requests not approved

Open **Generate website**. Enter a name and prompt, then generate a separate candidate. Inspect **Candidate preview**, optionally **Edit candidate before saving** through Puck, then **Apply candidate edits** to return to preview. Apply is local-only; explicitly **Save candidate as new project** to persist it. After saving, **Open candidate in editor** uses the existing workspace. Generation never auto-saves, replaces the active document or sends that document to the provider. The prompt becomes the candidate description only on explicit save.

For mock-only development, start `npm run backend:mock` in a separate terminal. `npm run backend` is disabled by default; a key alone does not enable live requests. Do not enable live access or use Gemini quota without a new approval. See [safe key preparation](docs/gemini-key-setup.md).

- Mock output is conspicuously labeled **TEST MOCK — not real AI** and persists that provenance.
- **Use local template fallback** needs no backend and is explicitly **not AI**. Unlike the existing M2A Create Project action, this fallback previews an unsaved candidate first.
- Cancel, close, context switches and deadlines invalidate pending responses. No delayed result is adopted into a different workspace.
- Generation is restricted to ten allowlisted block types, local sample images and valid section anchors. No arbitrary HTML, scripts, tool calls or generated code is executed. Editor URL capabilities after saving remain the existing M1 policy.
- The M2C Gemini prompt/structured contract is tested with injected responses. One earlier M2B live two-block smoke succeeded; the M2C three-block live attempt ended in a provider HTTP error before content validation, so M2C category/language/content quality is **not live-verified**. Current model/account/quota readiness is not inferred from the historical M2B smoke.

## Observability and bounded generation

Generation exposes explicit `success`, `provider_error`, `validation_error`, `timeout` and `cancelled` states with safe request receipts. Server telemetry records exactly-once HTTP finish/disconnect metadata, never prompts, raw responses, session headers or provider keys. Client/UI waits and browser observation have independent deadlines; a stalled body does not require the observer to wait indefinitely or mistake an error UI for a missing candidate.

`npm run test:observability` runs the dedicated synthetic transport/fault suite. `npm run test:e2e` runs the existing regressions plus that suite. Network traces are disabled to avoid retaining headers/raw bodies. See [observability verification and historical limitations](docs/m2b-observability-verification.md).

The earlier PID 17788 attempt remains inconclusive; the later PID 5808 attempt conclusively ended in `validation_error`, with no candidate and no retry. Neither is a verified live generation success. The subsequent [PID 17204 retest](docs/smoke-observations/launcher-17204.json) succeeded with one transport call, two valid blocks, visible preview and no Save. Its approval is spent; this does not establish why PID 5808 failed or verify the newer M2C contract.

### Validation root-cause analysis and fix

See [M2B validation RCA and verification](docs/m2b-validation-rca.md) and [current mock readiness evidence](docs/m2b-validation-readiness.json). Documented `thoughtSignature`/`partMetadata` no longer invalidate otherwise valid text Parts; opaque metadata never reaches candidate content or logs. Provider JSON Schema uses the documented subset, while strict local Zod and semantic policy remain authoritative. Unicode length checks are consistent across generation and candidate preview.

Safe optional diagnostics now retain a fixed reason/stage and bounded allowlisted issue paths (not raw values or Zod messages), through backend telemetry, UI and observer. A proven mock bug is **not proof of the historical live cause**. No new live request is authorized; a future single-request smoke needs fresh approval.

## Prepared bounded smoke observer

`npm run smoke:observe -- --mock` rebuilds and verifies the whole current path with the unchanged single-request mock launcher, fresh production preview and bounded observer. No selection stays disabled. Live observation additionally requires a fresh human approval and an explicit verified launcher PID; it never receives the backend key or starts a live backend. Safe, exclusive ledgers and synthetic screenshots are stored in `docs/smoke-observations/`.

See [next live test preparation](docs/next-live-smoke-preparation.md) and [readiness evidence](docs/next-live-smoke-readiness.json). Do not run live startup/observation until a new explicit approval.

The [M2C acceptance preparation](docs/m2c-live-acceptance-preparation.md) describes the coffee-shop scenario; its old fingerprint record is historical. The [M2C provider HTTP RCA](docs/m2c-provider-error-rca.md) and [RCA readiness](docs/m2c-provider-error-readiness.json) record the earlier status-telemetry fix. `npm run smoke:observe -- --mock --scenario=coffee-shop` rehearses Hero → Features → Contact and local editing without Save. A real request still needs fresh explicit approval; the original two-block scenario remains unchanged when no scenario is selected.

Safe provider HTTP diagnostics now retain numeric `providerStatus`, allowlisted `providerErrorCategory` and `providerRetryable` through backend receipts/finish events, UI and observer ledgers. Potential retryability never authorizes another smoke request. The historical upstream status for PID 18104 remains unknown; local telemetry fixes do not prove that provider rejection is resolved. Canonical/Puck contracts and the single-request launcher limits are unchanged.

## Single-request smoke preparation

Latest audit/results/hashes: [M2C Gemini request contract audit](docs/m2c-request-contract-audit.md) and [request-contract readiness](docs/m2c-request-contract-readiness.json). A fail-closed guard validates the application envelope/configuration/schema before transport; valid coffee request bytes remain unchanged. Optional error diagnostics now inspect at most 4096 bytes for 150 ms and retain only an allowlisted `providerRpcStatus`, never raw body, message or details. The historical Gemini HTTP 400 cause remains unproven; the audit does not authorize another live call or speculative format/model changes.

The separate `npm run backend:smoke` launcher defaults to disabled even with an inherited key/live flag. `npm run backend:smoke -- --mock` uses a synthetic Gemini-format transport and explicit mock provenance. It enforces `maxAttempts: 1` and a non-refundable lifetime transport budget of one call. `npm run test:smoke` verifies these guardrails without real provider requests. The standard backend is not the single-request launcher; its existing bounded retry policy is separate.

See [single-request setup, free-tier prerequisites and cleanup](docs/single-request-smoke.md). **No current live activation or Gemini request is approved. M2C development is mock-only.** Do not re-enter a key already prepared in the backend PowerShell session.

## Managing projects

Open **Projects** to create, list, open, rename or delete saved websites.

- Enter a project name, description, and starter template: General business, Coffee shop, Barbershop, Portfolio or Car rental. These are examples, not permanent product categories.
- **Create project** performs deterministic template expansion and saves a new canonical document with a UUID. This is **template-based generation, not AI**. Images, contact details and copy are editable placeholders; there is no real booking form or backend action.
- Opening another project prompts before discarding an unsaved/invalid draft. A project URL (`?project=<id>`) preserves selection across browser refresh; opening the bare root still uses the backward-compatible starter workspace.
- **Rename** changes project metadata, not the website's edited copy. Renaming the active project preserves its unsaved block changes.
- **Delete** requires confirmation. Deleting the active project also warns about unsaved edits and opens a new, unsaved blank draft with a different ID. Other projects remain untouched. There is no undo/trash for confirmed deletion.
- **Export current JSON** downloads the current validated draft, including optional metadata; it does not mark unsaved changes as saved. Invalid or blocked fallback data cannot be exported as if it were a valid loaded project.
- Choose a JSON file, review its name/ID/revision, then click **Import project**. Schema validation precedes writes. An existing ID—even one containing corrupt data—is never overwritten. Select **Import as a copy** explicitly to replace the ID with a new UUID and reset revision to 0 while retaining content and other metadata.
- Standard import preserves the original canonical document, including its ID and revision, when that ID is free. The import safety limit is **4 MiB**; oversized files are rejected without writes.
- Listing discovers legacy v1 records directly. No separate index or automatic migration is written. Unreadable records are reported and preserved, not deleted to make the list work.

Browser data belongs to the exact origin. `127.0.0.1:5178`, `localhost:5178` and another port have separate stores. Export/import is the current deliberate way to move documents. See [storage and migration strategy](docs/storage-migration.md).

## Generated website design

Generation supports four coherent visual directions: **Sage editorial**, **Ocean modern**, **Ember studio**, and **Midnight product**. In the generator, select **Design direction** or leave it automatic for the Website Plan provider to choose from the prompt. The same host-owned colors, type, spacing and hero composition apply to candidate rendering, Puck editing and device preview. Explicit selections also work with the local template fallback, which remains clearly labeled as non-AI.

Optional `design.preset` metadata is preserved in canonical Schema v1, storage and JSON interchange. Old documents remain unchanged. Older application versions may reject styled documents; keep an exported JSON copy before downgrading. This stage is verified with synthetic generation and browser fixtures, not new live inference. See [design engine and verification](docs/generation-design-engine.md).

The Rona Kopi reference adds an editorial coffee hero, replaceable menu photo slots, local SVG artwork and an accessible gallery carousel. It was saved and reloaded using a synthetic fixture. Its separate live OpenRouter attempt failed with HTTP 502; this is not evidence of live design quality. See [Rona implementation and acceptance](docs/rona-coffee-design-acceptance.md).

### Generation completeness

Choose **Standar kelengkapan** before generation: general website, café/restaurant, product catalog, services, portfolio or car rental. A local brief suggestion is available; explicit selection wins. Provider instructions describe the relevant structure while preserving exact requested counts/order and leaving unknown business facts empty.

Candidate review shows available/missing sections separately from prices, contacts, opening hours and original images still to fill in. It updates after local candidate edits, flags missing CTA targets, and also reviews non-AI template fallback. Checks are advisory; drafts still require explicit Save. The checklist is structural, not a publication or factual-quality guarantee, and is not yet persisted as project metadata. See [completeness behavior, verification and limits](docs/generation-completeness.md).

## Using the editor

1. Select a block in the canvas to edit its fields. On narrow screens, open **Fields**; **Blocks** and **Outline** are available in Puck's mobile toolbar.
2. Drag a component from **Blocks** into the canvas. Puck also supports duplicate, delete, reorder and undo/redo. Changes remain drafts until explicitly saved.
3. Expand **Live preview** for the canonical rendered document, or use **Preview** for a full-page view. Preview does not discard editor history.
4. Click **Save project** to save the validated canonical document to localStorage. The status becomes **All changes saved** only after reading the stored value back.
5. **Reload** loads the saved document. Unsaved drafts require explicit discard confirmation. A browser refresh also reloads saved data; unsaved drafts are not auto-saved.

Invalid required text or unsafe URLs show an error and pause canonical preview/save until corrected. A failed write keeps edits in the current tab. Corrupt or unknown stored data is never automatically replaced. A revision conflict requires deliberate reload/discard or manual recovery, not silent overwriting.

## Supported editable blocks

| Block               | Fields                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------- |
| Heading             | Text                                                                                   |
| Paragraph           | Text                                                                                   |
| Button              | Label text, destination URL                                                            |
| Image               | Image URL, alternative text, caption                                                   |
| Hero                | Headline, subtitle, CTA label, CTA URL, optional composition and photo                 |
| Section             | Title, body, light/sage/dark theme                                                     |
| Features / Services | Section title, grid/list, editable item titles and descriptions                        |
| Menu / products     | Item names, descriptions, prices and optional photo URLs/alt                           |
| Gallery             | Images, alternative text, captions, grid or carousel                                   |
| Contact             | Title, body, email, phone, address and optional opening hours; static information only |

Hero, Section, Features/Services, Menu, Gallery and Contact remain standalone blocks, not nested page containers. Features, Menu and Gallery contain bounded item arrays. Carousel renders as a grid while editing so every item remains accessible. Contact has no submission, booking or payment backend. Images use URLs, not uploads. Local sample SVGs are included. URL inputs accept `http://`, `https://`, root-relative `/paths`, and `#anchors`; executable/data/protocol-relative URLs are rejected, including transient editor rendering.

## Architecture and data safety

Universal Project Schema **v1 remains canonical**. Puck data is an editor projection, not the persisted document. A strict two-way adapter preserves supported block properties, IDs, order and project metadata. Unknown fields, components, nested zones and duplicate IDs fail validation instead of being silently dropped.

M0/M1 documents remain valid and load without migration or automatic writes. M2A adds optional description and template provenance to Schema v1; old documents do not acquire these fields automatically. Explicit Save (including Save candidate as new project), Rename, Create, Import and confirmed Delete are the only project mutation flows. Source snapshots are preserved in `.milestones/m0-before-m1/` and `.milestones/m1-before-m2a/`; neither is a backup of browser data. Older app versions may reject newer fields/blocks—retain JSON backups before downgrade.

Each project currently contains one flat page. Rich text, nested layout, uploaded media, payments, authentication, production database and cloud deployment remain out of scope. `ai/provider.ts` retains the legacy unimplemented provider contract; M3 Phase 1 uses the separate `ai/edit-proposal.ts` and `ai/mock-chat-editor.ts` local mock engine. `ai/website-generation.ts` remains the generation contract. M2B adds optional AI/mock provenance without migrating legacy documents. The pre-M2B source checkpoint is `.milestones/m2a-before-m2b-phase1/`, not a browser-data backup.

localStorage can be cleared by the browser and has quota/privacy limitations. Revision checks detect stale saves but are **not atomic cross-tab transactions**. No auto-merge or durable unsaved-draft recovery is promised.

All dependencies and npm cache are project-local. There are no paid services, remote fonts or required remote image services. Never place secrets in frontend variables, including `VITE_*`.

See [architecture](docs/architecture.md), [M0 verification](docs/m0-verification.md), [M1 verification](docs/m1-verification.md), [M2A verification](docs/m2a-verification.md), and [M2B Phase 1 verification](docs/m2b-phase1-verification.md). M3 Phase 1 is limited to mock chat editing. Stop before real AI chat integration, new live smoke testing or M4.
