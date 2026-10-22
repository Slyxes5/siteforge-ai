# M2C — Advanced website generation plan

Scope: implementation and verification with mock/disabled transports only. No real Gemini request, credential access, live activation, M3, business backend or UI redesign.

## Inspection and decisions

- Keep canonical Project Schema v1 and all legacy block shapes. Add two strict block variants, not a new storage format: `features` (also services/projects, grid/list) and static `contact` (no form/backend action). New reader remains compatible with old v1 documents; old binaries cannot read the new block types.
- Features/Services share bounded editable card items instead of separate near-identical types. Gallery remains a composition of existing Image/Section blocks using local placeholders; uploads, remote generated images and a dedicated gallery block are deferred.
- Retain the 12-block / 4096-output-token budget. Group related details in at most six short feature items instead of inflating block/token limits. Exact small prompts such as the two-block smoke request must not be expanded automatically.
- Introduce prompt contract v2; accept legacy provenance v1. Plan section order, language, business category, requested content and layout before returning JSON. Use only known blocks and grounded business details; absent facts use placeholders, not invented claims.
- Add deterministic guards for contact values and detectable numeric/currency/contact claims copied from the supplied input. This is not a universal natural-language fact checker; document residual semantic limitations and require review.
- Support editing an unsaved candidate through the existing Puck boundary with local draft validation and no persistence until explicit Save as new project. Keep the existing save-then-open path and isolate candidate editor callbacks from later candidates/context switches.
- Keep standard provider selection disabled by default, single-request launcher sources/budget unchanged, safe diagnostics and explicit local-template fallback. Extend the local template selection with car rental.

## Incremental implementation

1. TDD additive schema, adapters, renderers and Puck fields for Features/Services and Contact.
2. TDD generation schema, semantic checks, prompt v2 and input-grounding policy. Browser rechecks the restricted candidate before preview.
3. TDD candidate editing before Save, cancellation/context isolation, and category-specific synthetic fixtures and local fallback.
4. Run typecheck, production build, unit/provider/integration/guard tests, full existing browser regressions and new M2C E2E. Rehearse the existing single-request runner in mock mode only; inspect screenshots and verify owned test ports close.

Checkpoint: `.milestones/m2b-before-m2c/` (source only, no environment files, credentials or dependencies; not a browser-storage backup).

Acceptance: coffee shop, barbershop, car rental, portfolio and general-business mock contracts generate differing supported compositions; new fields survive Puck edit/preview/Save/reload/export round trips; invalid/ungrounded candidates are rejected with safe reasons; templates remain explicitly non-AI; no automatic writes/overwrites and no real provider calls.
