# M2A verification — Project Manager & Deterministic Website Generator

## Delivered scope

M2A adds a minimal Projects panel while retaining the M1 editor and visual shell. Users can create named/described websites from four starter templates, edit them in Puck, explicitly save/reload, switch/reopen independent documents, rename, confirm deletion, and export/import canonical JSON. Template generation is clearly labeled **template-based, not AI**. General business, Coffee shop, Barbershop and Portfolio are catalog examples, not universal-schema business categories.

All implementation changes are under `C:\Projects\siteforge-ai`. No external API, paid service, authentication, production database, cloud deployment, M2B or M3 was implemented. No new dependencies were required; `package.json` and `package-lock.json` are byte-identical to the pre-M2A snapshot.

## Checkpoint and preservation

The directory was not a Git repository. Before significant edits, an equivalent safe source snapshot was created at `.milestones/m1-before-m2a/`, including source, tests, configuration, local assets and documentation. Dependency/cache/build folders and credential-bearing `.env` files were not included. The snapshot is not a backup of browser project data.

The existing v1 key prefix is retained. Listing/opening does not migrate, rewrite or delete saved records. Corrupt records and unknown schemas are surfaced and left untouched. Create/Import reject any existing destination key, even corrupt data. Delete is only exposed behind a named confirmation; active-project deletion additionally warns about unsaved content. Intentional confirmed deletion is not an accidental-loss guarantee.

## Final quality gates

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 15 test files passed; 43 tests passed |
| `npm run test:e2e` | Production build passed, then all 15 browser E2E tests passed |
| Playwright result JSON | 15 expected; 0 unexpected, 0 skipped, 0 flaky |
| Existing M1 regression source | All 8 original unit-test files and all 4 original E2E/fixture files byte-identical to the snapshot |
| Existing M1 browser scenarios | All 9 original scenarios passed unchanged |
| `npm audit` | 0 vulnerabilities at execution time |
| Dependency manifests | Unchanged from M1 |
| Source/emitted-JS secret-pattern scan | No checked key/private-key patterns found |
| Existing local server | HTTP 200 on port 5178; M2A App module served |

Browser E2E uses a separate temporary Chrome profile under the project directory and a temporary loopback production-preview server on port 5189. It never uses the user's everyday Chrome profile or saved browser storage. The existing port-5178 service was not restarted. Tests work on isolated fixture records, not user documents.

## What was exercised

### Unit/integration

- Four deterministic generators validate against canonical Schema v1, include explicit template provenance, preserve description, and project losslessly into/out of the M1 Puck adapter.
- Identical generator inputs produce identical canonical output; template copy differs across catalog entries.
- Legacy documents still parse identically without optional metadata being added.
- Generated contact anchors have real canonical section targets.
- Multi-project insertion/listing discovers legacy keys and ignores unrelated storage.
- ID collisions, including corrupt raw records, cannot be overwritten.
- Rename/delete require the exact current canonical snapshot. Rename changes only metadata/revision, preserves other projects, and keeps active unsaved block edits.
- Failed storage mutations leave previous saved data intact in the exercised failure cases.
- JSON export/import round-trips legacy/generated documents without supported-data loss; invalid schemas/versions/unknown fields and oversized imports are rejected.
- Explicit copy changes only project ID/revision and does not mutate its source.
- Opening another document confirms discard when needed and restores selection via the URL on refresh.
- Active deletion uses a fresh blank-draft ID; a later save cannot silently restore the deleted record in that session.
- Late callbacks from an old editor instance cannot modify/save blocks into a new project's identity.

### Browser E2E

- Create Coffee project → edit Hero → Save → create/edit/save Barbershop project → switch back → reopen/refresh, comparing both independent stored documents.
- Download actual JSON through the browser and read its contents; verify equality with the canonical document.
- Reject reimport of an occupied ID without touching its original data.
- Explicit import-as-copy creates a different ID/revision lineage while retaining content/metadata.
- After deliberate confirmed deletion frees an ID, standard import restores the exact exported canonical document, including its original revision, without changing the copy.
- Rename a project, cancel deletion and confirm the draft remains; then confirm deletion with an unsaved warning and verify only that record is removed.
- List legacy and corrupt records without migration; reject invalid/oversized imports without any storage change.
- Simulate exhausted storage on Create and Import; verify previous records and active project remain intact.
- At 390 × 844, use the mobile manager/create flow, inspect a loaded editor, and verify no document-width overflow in management/preview.
- All original M1 editing, preview, save/reload, failure, conflict, insertion/deletion and mobile cases remain green.

No unexpected data loss was observed in these tested scenarios. This is not a guarantee against browser eviction, user clearing site data, unsaved-tab loss or simultaneous cross-tab races.

## Integrity issues found and resolved

1. **Late editor callbacks after switch:** a regression test reproduced old Puck data being applied under the new project's identity. A synchronous editor-epoch fence now rejects stale change/save callbacks after open/reload/delete remounts.
2. **Anchor shadowing by hidden editor DOM:** a browser assertion reproduced Preview links targeting an identically named section inside the hidden editor. Editing instances now omit anchor IDs; canonical Preview/Live Preview renders the actual target IDs. The generated CTA target is verified to be outside hidden ancestors.
3. **Metadata preservation:** Schema v1 only gains optional `description` and `generation`. The existing adapter retains them through its canonical base, and generator/JSON round-trip tests verify this behavior.

## Changed files

- `src/app/App.tsx`: Projects toggle/panel and editor remount key scoped by project identity/generation.
- `src/app/use-project-workspace.ts`: explicit switching, selection URL, safe rename/delete lifecycle and stale-editor epoch guard.
- `src/project-schema/project.ts`: optional description and template provenance, retaining v1 and all prior block shapes.
- `src/persistence/local-project-store.ts`: shared prefix/key exports; original save/revision behavior retained.
- `src/editor/puck-config.tsx`: safe canonical Section anchor IDs.
- `src/styles.css`: small, scoped management forms/list/mobile rules; no major redesign.
- `README.md`, `docs/architecture.md`: current usage and module boundaries.

## New files

- `src/app/ProjectManager.tsx`
- `src/app/multi-workspace.test.tsx`, `src/app/project-manager.test.tsx`
- `src/generator/templates.ts`, `src/generator/templates.test.ts`, `src/generator/generator-render.test.tsx`
- `src/persistence/project-library.ts`, `src/persistence/project-library.test.ts`, `src/persistence/project-mutations.test.ts`
- `src/project-schema/project-json.ts`, `src/project-schema/project-json.test.ts`
- `e2e/project-manager.spec.ts`, `e2e/project-storage-failure.spec.ts`
- `docs/storage-migration.md`, this report, and the M2A screenshots below.

No existing source/test file was deleted. Build/cache/test artifacts remain inside the project and are not user project-data backups.

## Screenshot evidence

Real screenshots were captured from isolated test projects and visually inspected; they are not user documents:

- `docs/screenshots/m2a-project-manager.png`
- `docs/screenshots/m2a-generated-preview.png`
- `docs/screenshots/m2a-manager-mobile.png`
- `docs/screenshots/m2a-preview-mobile.png`

Basic desktop/mobile inspection found no blocking clipping or overflow. This is not comprehensive cross-browser, physical-device or accessibility certification. M1 screenshot files remain preserved separately.

## Remaining limits and migration strategy

- One flat page per project; six editable M1 block types. No nested layout, rich text or media uploads.
- Deterministic templates interpolate provided details and fixed copy; they do not understand arbitrary requirements or claim AI generation. Placeholder content must be reviewed by the user.
- Projects are scoped to browser profile/device and exact scheme/host/port. Clearing origin data can remove them. Export important documents.
- Import is capped at 4 MiB. Larger schema-valid exports can be backups but cannot currently be reimported under this safety cap.
- Drafts are not auto-saved or durably recovered after tab loss. Confirmed deletion has no trash/undo.
- Direct prefix discovery is intentionally simple and unpaginated. No large-library performance benchmark is claimed.
- Snapshot/revision checks are best-effort, not atomic cross-tab transactions or collaboration.
- Older strict M0/M1 readers are not promised forward compatibility with newer optional metadata. Keep original JSON before downgrade.
- The existing Puck transitive deprecation and substantial editor bundle remain M1 limitations; no new dependency was introduced.

`docs/storage-migration.md` documents a future, user-triggered copy/validate/read-back migration with JSON backups, explicit ID conflict choices, transactional server revisions, resumability, and source cleanup only under separate approval. It is a plan only: no backend/database was enabled.

**Stop at M2A. M2B and M3 require explicit approval.**
