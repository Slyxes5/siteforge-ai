# M2C Website Plan → SiteForge Compiler

## Status and scope

Local/mock implementation complete. No real Gemini request was made. No API key was requested or read, model changed, billing enabled, dependency installed, storage migration performed, UI redesigned, or M3 started.

Source checkpoint: `backups/generation-contract-20261020-031600.zip`. This repository has no `.git` metadata. The source snapshot excludes credentials, dependency artifacts and browser project data; it is not a backup of persisted projects.

## Architecture

```text
Original {name,prompt}
  → Gemini adapter (default website-plan-v1; fixed model/transport/budget behavior)
  → bounded envelope + content JSON parsing
  → Website Plan shape and per-type semantics
  → deterministic SiteForge Compiler
  → existing buildCandidate / grounding against ORIGINAL request
  → canonical Project Schema v1
  → existing browser candidate policy + preview
  → Puck edits → Apply (memory only) → explicit Save → existing v1 persistence
```

The compiler does not translate, reorder, summarize or add business copy. Each input block yields exactly one canonical block. It assigns server-owned IDs, resolves zero-based destination indices, supplies only structural defaults, and fixes image sources to the existing placeholder. Invalid/unknown data is rejected, not silently dropped. Invalid plan output never triggers legacy parsing or another request.

### Boundaries and files

- `src/ai/website-plan.ts`: local strict schema, small provider schema projection and compiler.
- `server/website-plan-request.ts`: fixed request envelope, instruction, exact schema allowlist and pre-transport body limit.
- `server/gemini-provider.ts`: default plan contract; explicit `contract: "m2c"` retains the existing request adapter for rollback. Returned text remains transport-only; `outputFormat` selects backend compilation.
- `server/generation-server.ts`: compiler selection, unchanged auth/rate/deadline/error machinery.
- `server/mock-website-plan.ts`: deterministic synthetic fixture conversion/provider, NOT AI or a runtime fallback.
- `server/config.ts`: normal explicit mock mode now exercises the plan compiler.
- `server/smoke-startup.ts`, `scripts/mock-coffee-smoke.ts`: synthetic Gemini envelopes now contain Website Plans; unchanged single-use transport budget.
- `src/ai/website-generation.ts`: optional adapter output-format discriminator; old injected providers without it retain legacy behavior.
- `src/ai/website-plan.test.ts`, `server/website-plan-provider.test.ts`, `server/website-plan-request.test.ts`, `e2e/website-plan.spec.ts`: new coverage. Existing config, coffee, Gemini, M2C editing and legacy observability fixtures were updated to select their contract explicitly.
- `scripts/compare-generation-contracts.ts`: reproducible offline comparison.

`src/project-schema/project.ts` is byte-identical to the checkpoint. Persisted schemaVersion remains 1; generation promptVersion remains 2, which existing storage accepts. The separate provider instruction explicitly identifies `website-plan-v1`. No new storage metadata was introduced. Existing Puck renderer, UI and persistence implementation files were not modified.

## Website Plan v1 contract

Root: strict object `{ "blocks": [...] }`, 1–12 blocks, no project metadata.

Every block uses ONE strict object shape with ALL fields required:

| Field | Local rule | Mapping |
|---|---|---|
| `type` | heading, paragraph, button, image, hero, section, features, contact | Existing canonical type |
| `text` | max 2000; nonblank except image | Main text/title/caption |
| `body` | max 2000 | Hero subtitle; section/contact body; image alt |
| `action` | max 2000 | Hero CTA text only |
| `target` | empty or canonical decimal index of section/features/contact | Hero CTA/button anchor |
| `style` | empty, light, sage, dark, grid, list | Section tone or features layout |
| `items` | features: 1–6 strict `{title,description}` objects; others empty | Feature/service/project entries |
| `email` | max 320, contact only | Must be supplied in original input or empty |
| `phone` | max 80, contact only | Must be supplied in original input or empty |
| `address` | max 500, contact only | Must be supplied in original input or empty |

Unused strings MUST be empty and unused arrays MUST be empty. Incorrect nonempty fields are rejected, not discarded. Feature titles are nonblank, max 80; descriptions max 240. Defaults: section tone `light`, feature layout `grid`; no default business facts. `target: "0"` is valid for an anchorable block at index zero; numeric fields, leading zeroes, newline suffixes, negative/out-of-range indices and non-anchorable targets are rejected.

Example (Indonesian hero → contact, no invented details):

```json
{"blocks":[
  {"type":"hero","text":"Kedai Anda","body":"Tambahkan pengantar usaha Anda.","action":"Kontak","target":"1","style":"","items":[],"email":"","phone":"","address":""},
  {"type":"contact","text":"Kontak","body":"Informasi kontak belum diberikan.","action":"","target":"","style":"","items":[],"email":"","phone":"","address":""}
]}
```

### Grounding and content limits

Existing grounding runs on compiled visible/nested content against the ORIGINAL request; browser acceptance rechecks it. Forged response descriptions cannot authorize fabricated facts. Empty contact fields remain empty. Existing checks are bounded copied-token/contact/numeric guards, not universal fact verification. Natural-language certifications, achievements or subtle claims are also prohibited in the instruction but cannot all be proved false automatically. Language, requested order and copy preservation are compiler invariants; whether a real model follows a brief remains unverified until separately approved live acceptance.

## Complexity comparison

Reproduce locally, no network:

```bash
node --import tsx scripts/compare-generation-contracts.ts
```

Same coffee acceptance input, same output limit, UTF-8 bytes. Schema depth counts actual schema nodes, not JSON container depth.

| Metric | Legacy M2C | Website Plan |
|---|---:|---:|
| Request bytes | 8834 | 3966 |
| Schema bytes | 5295 | 883 |
| Instruction bytes | 2410 | 1937 |
| Schema nodes | 52 | 16 |
| Maximum schema-node depth | 7 | 6 |
| Union branches | 8 | 0 |
| Required field occurrences across schema | 41 | 13 |
| Description annotations | 28 | 0 |
| maxOutputTokens | 4096 | 4096 |

Reduction: request 55.11%; schema 83.32%; schema nodes 69.23%; required field occurrences 68.29%. The simplification is real, especially in variants and repeated schema structure; depth improves only modestly. Detailed machine-readable output: `docs/website-plan-complexity.json`.

Tradeoff: uniform empty fields can make generated JSON longer for heading/paragraph blocks. Local semantic constraints remain strict, but no longer require provider-side union branching. Measurements are NOT token billing estimates or proof that Gemini will accept the request.

## Verification completed

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` — exit 0.
- Production: `npm run build` — exit 0.
- Unit/integration: `npm test` — 147 UI/domain tests and 204 server tests pass. Compiler suite contributes 27 tests, including all eight components, styles, order/language/content/anchors, empty fields, strict/unknown/invalid input, 12/13 block boundary, grounding, forged metadata and v1 Save/reload.
- Browser: `npm run test:e2e` — 36 main E2E and 26 observability E2E pass. Includes compiled candidate Puck edits → invalid Apply rejection → correction → Apply without persistence → explicit Save → reload, existing multi-project/error regressions, and real loopback mock backend for five categories: coffee shop, barbershop, rental mobil, portfolio and general business.
- Full five-category browser scenario uses a dedicated ephemeral loopback backend with the unchanged five-request admission limit. An initial combined-suite run hit 429 because earlier suites had consumed the shared backend budget. Isolating test state fixed the harness without changing production rate limits.
- Smoke mock coffee: 1 passed, HTTP 200, 3 blocks, valid canonical candidate, visible preview, one synthetic transport. Evidence: `docs/smoke-observations/mock-bd966ea0-4f4d-478c-b314-fefcf9804b2f.json`.
- Smoke mock two-blocks: 1 passed, HTTP 200, 2 blocks, valid canonical candidate, visible preview, one synthetic transport. Evidence: `docs/smoke-observations/mock-e1a09bca-9dcb-461b-8c09-44d14e9d0385.json`.
- Bundle guard: `npm run verify:bundle` — pass; checked credential patterns, backend key variable, Gemini endpoint/header and injected sentinel absent from client artifacts.
- Screenshot review: compiled desktop editor renders hero and section inside existing Puck shell; mobile rental candidate visibly includes hero, placeholder image, services, contact and about in order, with no apparent horizontal clipping. Desktop screenshot does not expose every below-fold section simultaneously; DOM/E2E assertions cover those separately.
- Cleanup: test listeners 5188 and 5189 free; pre-existing frontend listener 5178 remains occupied and was not restarted/stopped.

Initial expected RED: default Gemini adapter test failed because it still emitted the legacy schema. Existing legacy fixture tests then needed explicit legacy contract selection or plan compilation after integration; all final suites pass.

## Readiness and remaining risks

Ready for a separately authorized live acceptance of the NEW Website Plan contract. NOT evidence of successful real Gemini generation or resolution of the historical HTTP 400. No live request is authorized by this document.

1. Provider-side acceptance of responseJsonSchema remains unverified; simplification reduces complexity but does not prove the historical cause.
2. Strict unused-field rules or target indices may cause model-output validation failures. Such failure must remain visible and must not silently retry with the old payload.
3. Uniform blocks can increase output length; long 12-block plans may still hit the unchanged 4096-token output cap.
4. Mock categories are deterministic fixtures (largely Indonesian), not proof of universal AI business reasoning or multilingual model compliance.
5. Canonical provenance intentionally stays compatible at promptVersion 2; the exact generation contract is indicated in the request instruction/code, not newly persisted in project schema.
6. Legacy rollback is explicit adapter construction with `contract: "m2c"`; there is no new environment/live switch, model substitution or automatic fallback.

Stop here. Real Gemini testing requires separate approval and the existing single-request authorization/budget safeguards.
