# M2B Phase 1 verification

## Status

Implemented and verified inside `C:\Projects\siteforge-ai`. **Mock-only generation is working. The Gemini adapter is implemented, but no live Gemini request was made.** Stop here: live smoke testing, AI Chat Editing and M3 are not approved by this milestone.

Before significant changes, source was checkpointed in `.milestones/m2a-before-m2b-phase1/`, excluding environment/credential files, dependencies and generated build/cache folders. This is a source checkpoint, not a backup of browser data.

## Architecture delivered

- Separate `WebsiteGenerationProvider`; original text-editing contract remains separate and unimplemented.
- Canonical Schema v1 retained; optional AI provenance records provider, model, promptVersion and explicit live/mock mode. Contradictory provenance is rejected; legacy documents load without migration or writes.
- Stateless Node backend, CLI bound to `127.0.0.1:5188`, disabled by default. `GET /api/generation/status` and `POST /api/generate`; strict Host/Origin, cross-site rejection, session header and JSON body checks. Vite proxy targets the fixed loopback backend.
- Dedicated backend environment key, never a VITE variable or browser form value. Fixed Gemini endpoint, header-only key, configurable validated model and structured JSON schema. Candidate identity/provenance are built by the application, not accepted from model output.
- Strict restricted-content validation → canonical validation → bounded browser validation → unsaved candidate preview → explicit collision-rejecting insert. No backend persistence, arbitrary code execution, automatic save or replacement of the current project.
- Deterministic template fallback works without backend and remains labeled not AI. Mock results remain labeled TEST MOCK, including saved provenance.
- Cancellation, close/context changes and deadline guards ignore late/non-cooperative responses. Template candidates use the same explicit-save flow; M2A Create Project retains its original behavior.

Detailed modules, limits, security boundary and data flow are in [architecture.md](architecture.md).

## Executed quality gates

Final combined command, exit 0:

```text
npm run typecheck
npm test
npm run verify:bundle
npm run test:e2e
npm audit
```

| Check | Verified result |
| --- | --- |
| TypeScript | `tsc --noEmit` passed |
| Frontend/domain/integration | 63 tests passed in 19 files |
| Backend/Gemini injected-HTTP tests | 62 tests passed in 4 files |
| Production build | Passed |
| Browser E2E, real local mock backend | 28 tests passed |
| Existing M1/M2A regressions | Passed; 20 baseline test files remain byte-identical to the checkpoint |
| Bundle boundary | Synthetic backend-key sentinel absent; checked credential patterns, backend key variable and Gemini endpoint/header absent from client artifacts |
| Dependency audit | 0 vulnerabilities reported |
| Test-service cleanup | Loopback ports 5188/5189 closed after Playwright exit |

The bundle check uses only a generated synthetic sentinel, never a real key. It is a targeted artifact check, not a claim that regex scanning can prove the absence of every possible secret. Server tests block native external fetch; Gemini transport tests inject synthetic HTTP responses. Browser tests use an isolated temporary Chrome profile, not the user's stored documents or normal profile.

### Browser evidence

- Full mock backend flow: Prompt → Generate → validated preview with no stored candidate → explicit save as a new record → open/edit using real Puck fields → save → browser refresh. The original project remains byte-identical.
- Coffee shop, barbershop, portfolio and general-business briefs traverse the mock pipeline. This proves transport/schema/UI handling, **not** real Gemini semantic quality for those categories.
- HTTP rate-limit failure exposes fallback; fallback is explicitly not AI and is not auto-saved.
- Malformed JSON, unsupported blocks and remote/unsafe image output do not reach preview or storage.
- Cancellation and switching projects reject delayed results without writes.
- Disabled status prevents any generation POST.
- Mobile width 390: no horizontal overflow, readable one-line Close label, visible candidate and minimum 44px Save target. Existing M1/M2A mobile regressions also pass.

### Failures discovered and resolved

The first full browser run passed 26 of 27 tests. The failing no-external-request assertion identified a pre-existing `@import` of Inter font CSS in Puck's dependency CSS. The generation/edit/save flow itself had completed. A scoped Vite pre-transform now removes that CDN import without editing dependencies; the system-font fallback is used. Subsequent browser runs passed the assertion.

Screenshot inspection then found the mobile Close label breaking across three text lines. A focused regression reproduced that failure; a scoped no-shrink/no-wrap rule fixed it. Final E2E is 28/28, including this assertion. No original regression test was weakened or edited.

## Screenshots

Screenshots are from the final passing mock/template run and were visually inspected; they are not live Gemini output.

- [Mock candidate before explicit save](screenshots/m2b-mock-candidate.png)
- [Mock candidate opened and edited](screenshots/m2b-mock-editor.png)
- [Explicit deterministic fallback](screenshots/m2b-template-fallback.png)
- [Mobile generator and template candidate](screenshots/m2b-generator-mobile.png)

## Safe credential setup and running

See [gemini-key-setup.md](gemini-key-setup.md) for masked PowerShell entry into a dedicated backend process, cleanup and free-tier/privacy precautions. Do not paste credentials into chat or read another project's credentials. A key alone does not enable requests. **Keep `SITEFORGE_AI_ALLOW_LIVE=false` during Phase 1.** No real key was supplied or installed during verification.

Mock-only local use:

```text
# Terminal A, project directory
npm run backend:mock

# Terminal B, project directory
npm run dev -- --port 5178 --strictPort
```

Open `http://127.0.0.1:5178`, then Generate website. Mock bootstrap clears an inherited SiteForge Gemini key and forces live access off. Use free ports; do not stop another service. The normal `npm run backend` command starts disabled unless its explicit live prerequisites are configured. This report is not permission to enable them.

## Remaining limits / next approval boundary

- `gemini-3.5-flash-lite` is the configured initial candidate, not a model whose availability/account access/quota/content quality has been proved by a real request.
- No billing was enabled, no paid service installed, and no cloud deployment, migration, AI Chat Editing or M3 work was performed.
- At most 2 transient provider attempts; malformed/refused/truncated content fails closed without an AI repair loop. Provider responses are sanitized; exhausted provider errors do not expose raw provider bodies.
- Local application guardrails do not establish a zero-cost guarantee for future live calls. Account/provider-side billing, quota and free-tier eligibility must be reviewed before a separately approved smoke test.
- Generation is limited to 12 flat allowlisted blocks, local placeholder images and existing Section anchors. It is not arbitrary full-stack code generation. Factual accuracy is not guaranteed by schema validation.
- localStorage limitations and best-effort revision checks remain; no transactional cross-tab guarantee, collaboration, durable unsaved-draft recovery or browser-data migration was added. Explicitly saved descriptions contain the prompt and therefore travel with JSON export.
- Provenance is descriptive metadata, not a cryptographic authenticity certificate.

## Changed-file inventory

Relative to the pre-M2B source checkpoint (excluding dependencies, caches, build/test artifacts and the checkpoint itself):

- `docs/architecture.md` — modified
- `docs/gemini-key-setup.md` — added
- `docs/screenshots/m2b-generator-mobile.png` — added
- `docs/screenshots/m2b-mock-candidate.png` — added
- `docs/screenshots/m2b-mock-editor.png` — added
- `docs/screenshots/m2b-template-fallback.png` — added
- `e2e/website-generation.spec.ts` — added
- `package-lock.json` — modified
- `package.json` — modified
- `playwright.config.ts` — modified
- `README.md` — modified
- `scripts/check-client-bundle.mjs` — added
- `scripts/mock-backend.ts` — added
- `scripts/verify-build.mjs` — added
- `server/config.test.ts` — added
- `server/config.ts` — added
- `server/gemini-provider.test.ts` — added
- `server/gemini-provider.ts` — added
- `server/generation-server.test.ts` — added
- `server/generation-server.ts` — added
- `server/mock-provider.ts` — added
- `server/provider-error.ts` — added
- `server/start.test.ts` — added
- `server/start.ts` — added
- `server/startup.ts` — added
- `server/test-safety.ts` — added
- `src/ai/generation-client.test.ts` — added
- `src/ai/generation-client.ts` — added
- `src/ai/generation-content.test.ts` — added
- `src/ai/generation-content.ts` — added
- `src/ai/provenance.test.ts` — added
- `src/ai/website-generation.ts` — added
- `src/app/App.tsx` — modified
- `src/app/ProjectManager.tsx` — modified
- `src/app/WebsiteGenerator.test.tsx` — added
- `src/app/WebsiteGenerator.tsx` — added
- `src/project-schema/project.ts` — modified
- `src/styles.css` — modified
- `tsconfig.json` — modified
- `vite.config.ts` — modified
- `vitest.server.config.ts` — added
- `docs/m2b-phase1-verification.md` — added (this report)
