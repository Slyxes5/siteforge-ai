# M3 Phase 1 — Mock AI Chat Editing

This phase implements local deterministic editing, not a real AI integration. No chat backend, Gemini or OpenRouter request is required. M4, database, deployment and redesign are out of scope.

## Repository inspection and preservation

The supplied project directory contains no `.git` metadata. Commit history and a Git working-tree diff cannot be recovered from this checkout. No existing M3/chat/proposal implementation was found in the application source. The original M0 `ai/provider.ts` and `ai/changes.ts` contract and tests are retained for compatibility; the M3 proposal engine is separate because proposals must not advance the persisted revision before explicit Save.

A source checkpoint was created before editing: `backups/m3-phase1-baseline-20261020-181508.zip` (149 source/config/test files). Existing milestones, provider implementations, canonical schema and generation flow are preserved. This is not a backup of browser localStorage.

Baseline verification: typecheck passed; 158 frontend tests and 358 server tests passed.

## User flow

1. Open **AI chat editing**. The panel explicitly identifies itself as a deterministic mock, not real AI.
2. Enter a supported command. Current block IDs and types are listed in the panel. Multiple commands can be separated by newlines and form one atomic proposal.
3. **Create mock proposal** validates a separate structured proposal. The active draft and localStorage do not change.
4. Inspect the operation diff, then **Preview proposal** to render the validated before/after canonical document.
5. **Reject proposal** discards it without modifying the draft. **Apply proposal** is enabled only after preview and revalidates against the current draft and storage baseline. It updates the unsaved draft, not localStorage.
6. Use the existing **Save project** button to persist deliberately. Revision advances only here, using the existing optimistic storage conflict check and read-back verification.

Closing the chat panel drops its pending proposal. A reload or project/context switch drops the old proposal. A manual Puck change, save/revision change or invalid editor state makes an existing proposal stale and requires a new proposal. Apply remounts Puck and advances its editor epoch so delayed callbacks from the old editor cannot overwrite the approved draft.

## Mock command grammar

Values/properties use JSON, not JavaScript. IDs must match exactly. Examples for the starter project:

```text
update hero-heading text "A locally reviewed headline"
add paragraph after hero-heading {"text":"An explicitly requested paragraph"}
remove hero-copy
reorder hero-copy,hero-heading
```

`add <type> after start <properties>` inserts at the beginning. A new block receives a host-generated UUID; callers cannot choose or replace a block ID or type through an update. Reorder must list every current block ID exactly once. For complex block properties (for example `features.items`), supply the complete JSON value. Unknown commands and invalid block fields are rejected with an error; the mock does not pretend to understand arbitrary natural language.

## Safety contract

- Strict, bounded, versioned mock proposal envelope, allowlisted operations and canonical Schema v1 validation.
- Project ID, persisted revision and a key-order-stable snapshot bind a proposal to its exact draft. Same-revision unsaved changes are detected.
- Pure atomic previews: a failing operation rejects the entire proposal without modifying the caller's project.
- Existing block IDs and types remain unchanged. Duplicate, reused, unknown and malformed identities/orders are rejected.
- The baseline project's visible content, name/description and explicit user request supply grounding. Block IDs and URLs do not supply business numeric/contact facts.
- Reuses deterministic numeric/email/contact grounding checks and restricts newly changed external URLs/images to supplied sources. New anchors must target rendered section/features/contact IDs; dangling anchors and removal of previously valid anchor targets are rejected. Legacy dangling anchors may remain unchanged for backward compatibility.
- Grounding is not proof of arbitrary natural-language truth. Unsupported nonnumeric claims such as awards or street names embedded in prose are not fully semantically verified. In Phase 1 the deterministic parser copies user-provided values rather than inventing copy.
- No auto-save, provider fallback, external AI request, key lookup or schema migration. Proposal/preview state is ephemeral and separate from persisted project provenance.
- Cross-tab checks remain optimistic, not atomic transactions. A conflict requires deliberate recovery/reload, not auto-merge.

## Verification

Final checks passed:

- `npm run typecheck` and production build.
- `npm test`: 243 frontend/unit/integration tests across 35 files, plus 358 server tests across 31 files.
- `npm run test:e2e`: 56 main browser cases (including 12 chat cases) and 26 observability cases. Final reports contain zero unexpected, skipped or flaky cases; retries remain disabled.
- `npm run verify:bundle`: no checked credential patterns, backend key variables, Gemini/OpenRouter endpoints or injected sentinel in client artifacts.
- Prettier checks for all changed TypeScript files.
- Independent re-review passed with no remaining security or logic findings.
- Temporary test servers released ports 5188 and 5189.

Final execution counts and review results are recorded in `m3-phase1-verification.json` after all checks complete. One full run encountered a pre-existing CLI startup test exiting before ready; its suppressed diagnostic did not establish a root cause. The isolated disabled-mode case and the subsequent complete server suite both passed without code changes or ledger deletion. This transient failure remains disclosed rather than being called a proven M3 defect. Another browser run encountered Chrome `Network.getResponseBody` resource-identifier errors in two unchanged generation tests; the chat cases passed. The earlier full browser run passed these generation paths. A fresh final full run is used for the recorded verification result; these intermittent harness failures are not hidden. Existing regressions include generation/compiler/Puck paths using injected synthetic transports only. Dedicated chat browser tests block external and `/api/` requests and assert zero API calls.

Stop point: mock Phase 1 only. Real AI chat transport/provider integration requires a separate task and approval.
