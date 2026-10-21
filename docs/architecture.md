# SiteForge architecture — M2C (M0–M2B retained)

## M2C extension

Canonical Project Schema v1 remains the storage boundary. Additive `features` and `contact` variants extend the same Puck projection/renderer; no alternate document format or migration is introduced. Current readers accept old six-block documents and AI prompt provenance 1 or 2; older binaries may reject new variants/provenance. Do not downgrade without a JSON copy.

Generation uses prompt contract v2 with the same 12-block/4096-output-token ceiling. `generation-grounding.ts` checks copied contact values and detectable numeric/currency/email facts at backend construction and browser receipt validation against the actual submitted input. This is a conservative guard, not a general semantic fact checker. `CandidateEditor.tsx` reuses Puck for an isolated canonical draft before explicit Save; Apply never persists. Epoch/context/alive guards reject obsolete callbacks. User edits follow canonical editor constraints rather than being silently re-generated.

Features/Services share one grid/list item-array block. Gallery stays a composition of existing images/sections; Contact is static information, not a business backend. All M2C provider verification is mock-only. See [M2C verification](m2c-verification.md).

## Canonical data flow

```text
localStorage <-> validated ProjectStore <-> canonical Project v1
                                               |
                              toPuckData / fromPuckData
                                               |
                                          Puck editor
                                               |
                                      onChange validation
                                               |
                                    canonical live preview
```

## Module responsibilities

- `project-schema/project.ts`: strict v1 document, unique block IDs, eight discriminated block variants, URL policy. Existing Heading/Paragraph document constraints are retained.
- `editor/project-adapter.ts`: type-safe projection to Puck; strict validation on return, preserving project identity, name, revision, order, IDs and all supported properties. A TypeScript assertion is isolated at the discriminated-union projection boundary; runtime Zod validation precedes it.
- `editor/puck-config.tsx`: official Puck Config/fields/defaultProps/render definitions for Heading, Paragraph, Button, Image, Hero, Section, Features/Services and Contact. Root fields are deliberately empty; metadata stays outside Puck.
- `editor/VisualEditor.tsx`: official `<Puck>` API, `onChange` and `onPublish`. Puck `data` is initial-only; explicit reload remounts the editor via a generation key. Ordinary edits and preview toggles do not remount the editor.
- `renderer/ProjectRenderer.tsx`: same config + projection through render-only Puck entrypoint. No arbitrary HTML or JavaScript execution.
- `renderer/safe-url.ts`: validates transient input before attaching it to DOM URLs; canonical validation alone is insufficient because Puck renders while users type.
- `app/use-project-workspace.ts`: saved baseline vs draft, validation errors, dirty status, explicit save/read-back, reload confirmation, and beforeunload protection.
- `persistence/local-project-store.ts`: original v1 storage key and expected-revision policy retained. Corrupt data and storage errors propagate. No automatic migrations or autosaves.
- `ai/`: M0 structured text-edit contracts retained separately from the M2B generation contract, strict content validator and same-origin generation client. The earlier M2B two-block live smoke succeeded once; M2C-specific verification remains mock-only.

## Schema compatibility and migration policy

`schemaVersion: 1` and `siteforge:project:v1:<id>` are retained. M1 adds block variants without changing the shape or constraints of valid M0 Heading/Paragraph documents. Old documents need **no migration**. They are not rewritten on startup or reload. A normal explicit save retains identity and increments the persisted revision (first creation is revision 0).

This is backward-reader compatibility (M1 reads M0), not forward compatibility (M0 cannot read Button/Image/Hero/Section). Unsupported variants fail closed; nothing is discarded. For rollback, retain the original localStorage JSON or a copy before creating M1-only blocks. The source snapshot is not a backup of browser storage. Do not blindly downgrade a new document into an older reader.

Future nested layouts or document-shape changes require an explicitly approved schema version/migration with non-destructive copy/export, validation and rollback. M1 does not introduce a hidden Puck-only storage format or implicit migration.

## Editor API decision

Puck 0.23.0 remains installed, MIT, React 18/19 peer compatible. Official docs consulted:

- https://puckeditor.com/docs/api-reference/components/puck
- https://puckeditor.com/docs/api-reference/configuration/component-config

Implementation is checked against the installed declarations and exercised in a real browser. `iframe.enabled: false` lets editor and canonical preview share local document styles. This is appropriate for the allowlisted React blocks; it is **not** an arbitrary-code sandbox.

`height={800}` supplies a definite layout height. A percentage without a definite parent height caused Puck's mobile canvas to collapse; the regression test verifies the actual canvas intersection, not only page width. Puck handles mobile Blocks/Outline/Fields drawers. SiteForge's mobile actions have minimum 44px touch targets.

## Save/conflict policy

Only canonical Project JSON is saved. Required fields/URLs must validate. Expected revision must match current stored revision. On successful write, the exact project is loaded and compared before the UI reports success. Failure preserves the in-memory draft. Reload with unsaved edits needs confirmation. Corrupt storage blocks saving; it must be recovered deliberately, not overwritten by a sample.

localStorage read/check/write is not atomic across tabs; narrow concurrent-write races remain possible. This milestone detects ordinary stale-revision conflicts but does not claim transactional or collaborative editing.

## Retained baseline and current boundary

Flat single-page document, six allowlisted blocks and browser storage remain unchanged. M2A added multi-project management, deterministic templates and JSON interchange without external APIs. M2B Phase 1 adds a stateless local generation backend and a Gemini adapter, verified without real provider requests. Payments, authentication, backend database, cloud deployment, arbitrary code execution, nested layout, rich text, uploaded media and AI Chat Editing remain out of scope. Live smoke testing and M3 require further approval.

## M2A module extensions

- `generator/templates.ts`: pure, versioned template expansion. The caller supplies a unique ID; identical inputs produce identical canonical blocks. Template IDs are catalog examples, not a business-domain restriction in the document schema. Existing projects are never regenerated when opening or renaming them.
- `persistence/project-library.ts`: discovers canonical records by the existing key prefix. No secondary index means an index-write failure cannot orphan saved projects. New records check raw key presence, including corrupt data. Rename/delete require an exact canonical snapshot before mutation; every operation verifies the exact key afterward.
- `project-schema/project-json.ts`: strict JSON parsing, byte-size guard, canonical export and explicit copy policy. Standard imports preserve document identity/revision; copies change only identity/revision.
- `app/ProjectManager.tsx`: minimal list/create/import/export interface; named delete confirmation; file-read tokens prevent a late older file read replacing a newer selection.
- `app/use-project-workspace.ts`: URL-based selection, guarded switching, rename without dropping drafts, safe active-project deletion, and an editor epoch fence. Late callbacks from a prior Puck instance are ignored so they cannot apply old blocks to a newly selected project.
- `editor/puck-config.tsx`: canonical Section IDs provide real CTA anchor targets. Editing instances omit DOM anchor IDs, preventing a hidden editor from shadowing canonical preview targets.

Schema v1 adds only optional `description` and `generation` fields. `generation.kind` is `template`; provenance never claims AI. `templateId` is a string at the schema boundary so future catalog entries do not require hardcoding product categories into the universal schema. All prior valid M0/M1 documents are read without migration. Older strict readers are not promised forward compatibility.

See `storage-migration.md` for browser limitations and a future opt-in, non-destructive backend migration strategy. No backend/database migration was implemented.

## M2B Phase 1 extensions

```text
Name + prompt → same-origin /api proxy → loopback generation service
                                            ↓
                                    mock / Gemini adapter
                                            ↓
                          strict generated-content JSON validation
                                            ↓
                         application-owned UUID / block-ID remapping
                                            ↓
                          canonical schema v1 + AI/mock provenance
                                            ↓
                       bounded browser read + restricted revalidation
                                            ↓
                         unsaved candidate preview → explicit insert
                                            ↓
                                  existing M1 Puck editor
```

- `ai/website-generation.ts`: generation-specific provider contract and fixed limits. It does not implement or call the text-editing provider interface.
- `ai/generation-content.ts`: strict Zod allowlist and provider JSON Schema. Only the application sets project identity, revision and provenance. Duplicate IDs, missing targets, unsupported blocks/properties, remote images and non-anchor links fail closed. No regex extraction, silent coercion or unbounded AI repair loop is used.
- `ai/generation-client.ts`: same-origin status/generation requests, ephemeral backend session header, bounded response reader and independent candidate validation. It never receives the Gemini key.
- `app/WebsiteGenerator.tsx`: candidate remains separate from the active draft; explicit insertion uses the existing collision-rejecting project library. Unsaved-discard confirmation, unload guard, AbortController and context/epoch guards reject late responses. Template fallback remains independently usable without backend access.
- `server/config.ts`: fail-closed provider selection. Live selection requires a dedicated backend key, explicit Gemini provider and explicit live switch. Construction/status never probes the provider. Test mode and mock provider must both be explicit.
- `server/startup.ts`, `start.ts`: bind only `127.0.0.1`, default port 5188. No persistence or filesystem writes. No prompt/key/provider-body logging.
- `server/generation-server.ts`: exact loopback Host, Origin allowlist (5178/5189), cross-site rejection, JSON content type, transient session token, bounded request reads, one admitted/pending job and five admissions/minute. These are local CSRF/DNS-rebinding defenses, not a multi-user authentication system. Local processes with the same OS access are not an isolation boundary.
- `server/gemini-provider.ts`: fixed official HTTPS endpoint, validated model ID, header-only key, redirect rejection, structured JSON response format, token cap and bounded streaming reads. Provider output metadata is not trusted as project metadata. Refused/truncated/invalid output fails without candidate writes. Only transient network/429/5xx errors are retryable; at most two provider attempts, with bounded Retry-After handling and total deadline. Exhausted provider errors are sanitized rather than returning raw provider bodies.
- `server/mock-provider.ts`: deterministic test fixture, never marketed as real AI. `scripts/mock-backend.ts` clears a possibly inherited SiteForge key and forces live access off before importing the server.
- `vite.config.ts`: fixed loopback API proxy. A pre-transform removes Puck's vendor CDN font import without modifying installed dependency files; Puck uses its system-font fallback. The browser regression asserts no external requests in the mock editing flow.
- `scripts/verify-build.mjs` and `check-client-bundle.mjs`: production build with a synthetic backend-key sentinel, then scan client artifacts for sentinel, checked credential patterns and backend-only Gemini markers. No real credentials are loaded for this check.

### Generation policy limits

Prompt: 4000 characters; name: 200; blocks: 1–12; content strings: 2000; output cap: 4096 tokens; incoming request: 16 KiB; provider/browser response: 128 KiB; per-attempt timeout: 45 seconds; total deadline: 90 seconds; attempts: at most 2. Local images must be `/sample-landscape.svg`; destinations must be empty or refer to an actual Section in the same candidate. Saved documents retain the existing general editor URL policy.

Schema v1 now additionally accepts optional `generation.kind="ai"` with provider/model/promptVersion and explicit `mode="live"|"mock"`; contradictory mock/live provenance is rejected. This is backward-compatible for existing readers in this version, not a promise that an older strict app can read newly extended documents. Provenance is descriptive metadata, not a cryptographic authenticity claim. Old records are never auto-upgraded.

### Observability and independent deadlines

Generation diagnostics are a strict allowlist: request ID, timestamps, monotonic duration, outcome, schema validation, provider attempts, configured transport invocations and safe numeric statuses. Server events distinguish a pre-transmission response snapshot from actual `finish`/`close`; finished writing is not proof of browser consumption. Raw prompts, responses, credentials and session headers are not logged.

The browser client bounds the full operation and stalled stream reads; the UI races even non-cooperative generators against its own abort/deadline and exposes all terminal states without autosave. UI receipts use a local pending ID until a validated server ID arrives; missing backend counts remain unknown. The shared E2E observer records response headers without blocking on body completion, then follows a new submission's terminal UI or its independent observer deadline. It never retries a click.

The synthetic observability fixture blocks external fetch and exercises the real Gemini parser with mock provenance. A separate browser config tests provider errors, invalid content, slow/stalled streams, cancellation and delivery stalls. No single-request live limit was changed. See `m2b-observability-verification.md` for evidence and the limits of historical inference.

The local backend is not a generated-code sandbox or production deployment. Model/account/free-tier availability and real Gemini generation quality remain unverified. See `m2b-phase1-verification.md` and `gemini-key-setup.md`.
