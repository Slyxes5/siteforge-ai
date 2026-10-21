# M0 verification

## Filesystem safety

- Source `C:\Projects\siteforege-ai` was a real empty directory, not a symlink.
- Destination `C:\Projects\siteforge-ai` did not exist.
- Preconditions were rechecked immediately before rename.
- Rename succeeded; source no longer existed, destination existed and remained empty before scaffolding.
- No unrelated project was modified.

## Executed checks

- `npm test`: 4 test files, 11 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; production output in `dist/`.
- `npm ls --depth=0`: resolved dependency tree, no peer conflict reported.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm audit`: 0 vulnerabilities, including development dependencies (registry snapshot at execution time, not a guarantee of future security).

Tests cover version/revision/unknown-field validation, sample rendering with safe text, outline selection, preview toggle, structured change validation and conflicts, immutable source documents, localStorage round trip, overwrite prevention and corrupt-data preservation.

Tests were introduced before their implementation and first failed on missing modules. During UI integration Puck's main entrypoint failed in JSDOM because `ResizeObserver` is absent; the actual render-only entrypoint resolved that issue without mocking Puck.

## Local browser verification

Port 5173 was occupied and its existing service was left untouched. SiteForge was started on the checked-free port 5178, bound to 127.0.0.1 with strict port selection.

Hermes's browser-profile automation could not copy the already-locked Chrome profile; Chrome was not closed or restarted. Verification instead used the desktop preview's local browser page:
- Loaded the SiteForge workspace and schema-backed document.
- Confirmed AI generation and brief controls are disabled.
- Selected the paragraph and observed the properties value update.
- Switched to preview and read back the rendered document and Back to editor control.

This is real browser DOM/interaction verification, not pixel-level screenshot or comprehensive responsive/accessibility QA. Desktop screenshot capture could not resolve an on-screen Hermes window; no screenshot evidence is claimed.

## Known issues / deferred work

- npm reports deprecated transitive `deep-diff@1.0.2`, required by Puck 0.23.0. Audit found no vulnerability; monitor upstream rather than forcing an unverified override.
- Production Puck rendering currently contributes substantial JS (two emitted JS chunks approximately 324 kB and 328 kB uncompressed). Optimize after measurement when interactive editing is scoped.
- Editing and save/reload are not exposed in the UI; AI is a contract only.
- localStorage revision checks do not prevent simultaneous cross-tab races.
- Visual/responsive QA and full Puck editor integration remain unverified.

Stop at M0. M1 requires explicit user approval.
