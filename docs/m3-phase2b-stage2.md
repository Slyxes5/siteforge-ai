# M3 Phase 2B — Stage 2: same-origin client and asynchronous ChatEditor

## Completion and scope

Stage 2 is complete against branch `main`, original HEAD `29ae78d`, with no staging or commit. Final independent code/security review passed with no findings. Verification exercised only synthetic/mock providers; no live OpenRouter/Gemini requests, paid fallback, or global configuration changes were made.

All eight source hashes recorded by the accepted Stage 1 verification artifact still match. The Stage 1 backend contract, routes, provider configuration, tests, and existing documentation were preserved. Canonical Project Schema v1, structured-edit host validation, proposal engine, deterministic parser, generation client/provider code, and persistence code remain unchanged.

## Files

Stage 2 added:

- `src/ai/edit-client.ts`: fixed same-origin HTTP implementation of `StructuredEditProvider` and sanitized `EditClientFailure` outcomes.
- `src/ai/edit-client.test.ts`: strict request/session/result, byte-limit, cancellation, deadline, cleanup, late-response, and no-retry tests.
- `src/app/ChatEditor.async.test.tsx`: pending/cancel, duplicate/out-of-order work, invalidation, host semantics, and mock compatibility.
- `src/app/ChatEditor.http.test.tsx`: default HTTP wiring, disabled/unavailable/live-status rejection, explicit offline choice, and sanitized HTTP timeout presentation.
- `src/app/ChatEditor.workspace.test.tsx`: real workspace integration, same-batch restoration guards, explicit Save, and project isolation.
- `e2e/chat-http.spec.ts`: eight synthetic end-to-end browser cases using the real protected edit backend.
- This document and `m3-phase2b-stage2-verification.json`.

Stage 2 modified:

- `src/app/ChatEditor.tsx`: explicit mode choice, async request lifecycle, captured snapshots, freshness checks, Cancel, cleanup, and sanitized errors; retains existing proposal/diff/Preview/Apply/Reject UI.
- `src/app/App.tsx`: passes chat-only freshness context/getter without remounting Puck for manual edits.
- `src/app/use-project-workspace.ts`: ephemeral monotonic editing epoch and synchronous getter; remembers invalid/change-then-restored states even within one React batch and rejects old Apply callbacks. No persisted metadata/schema changes.
- `src/app/chat-workspace.test.tsx`: regression for old Apply after invalid input is restored within one batch.

## Request and review flow

```text
Explicit synthetic-mock selection + user instruction
  → ChatEditor captures starting project, full canonical snapshot, context, and editing version
  → createStructuredEditProposal(startingProject, instruction, HTTP provider, signal)
  → HTTP provider validates and bounds projected instruction/context
  → GET /api/edit/status; strict mock capability/session validation
  → exactly one POST /api/edit/propose with X-SiteForge-Session
  → protected Stage 1 backend + injected/default synthetic fixture
  → bounded, strictly decoded untrusted edit operations
  → preserved host schema/semantic validation and host-owned proposal metadata/new IDs
  → latest snapshot, request ticket, mode, context, and editing-version revalidation
  → actionable proposal + operation diff
  → explicit Preview
  → explicit Apply or Reject
  → Apply changes unsaved draft only
  → explicit Save project persists and verifies the revision
```

Backend success is never an applied or trusted project. The HTTP provider returns only serialized `response` operations, not a proposal envelope. Full grounding, anchors, identity, revision, and snapshot checks remain authoritative in the preserved host engine.

## Activation and compatibility

The initial editing mode remains **Deterministic commands (offline mock)**. Opening the panel, selecting a mode, and typing do not send requests. Deterministic proposal creation remains synchronous and offline; preserved browser tests assert zero API calls.

To use the synthetic HTTP path:

1. An explicitly configured backend must have both `SITEFORGE_EDIT_PROVIDER=mock` and `SITEFORGE_AI_TEST_MODE=true`, or an owned test server must inject the Stage 1 synthetic provider.
2. The user must select **Synthetic backend (mock, HTTP)** in ChatEditor.
3. The user must explicitly click **Create synthetic mock proposal**.

The Stage 1 default fixture recognizes exactly `Set the first heading to "Welcome".` and requires a heading in the supplied context. It is a named fixture, not a general natural-language model. Both modes remain visibly identified as mock. The mode is ephemeral and resets to deterministic when the chat component is remounted, including after switching projects or approved application.

Disabled capability fails before POST. Unavailable or invalid/live-labelled status fails without retries or provider fallback. The UI does not silently change modes; deterministic commands remain available through explicit user selection. No persistent activation flags, credentials, or user-service configurations were changed; mock settings were confined to test processes and injected fixtures.

## HTTP and lifecycle protections

- Relative `/api/edit/status` and `/api/edit/propose` only; no endpoint/model/key overrides or direct browser provider transport.
- Explicit `credentials: same-origin`, `cache: no-store`, and `redirect: error`.
- Strict Stage 1 request/status/result schemas, including exact session-token format and mock-only capability/results.
- Request projection excludes project identity, revision, baseline snapshot, generation provenance, and saved-project records.
- UTF-8 context limit 131,072 bytes; whole-request limit 196,608 bytes; each status/result response bounded to 131,072 bytes using declared and actual stream sizes.
- Strict UTF-8, JSON, and JSON content-type decoding; invalid output never becomes an actionable proposal.
- A single client deadline of at most 45 seconds covers status, POST, and decoding; the preserved host deadline also covers proposal validation. Cancellation races noncooperative fetch/read settlement and discards late response bodies.
- Body cancellation is not awaited; noncooperative cleanup cannot hang rejection. Timers, listeners, and stream locks are cleaned up.
- Safe fixed error messages/outcomes; backend HTTP 504 is surfaced as a timeout without reflecting provider bodies or exception details.
- Synchronous active-request lock prevents duplicate submission. Request sequence tickets prevent old completion/finally handlers from publishing or unlocking newer work.
- Project/context/disabled/editing-version transitions, instruction/mode changes, Cancel, Close, and unmount permanently invalidate pending work. Snapshots plus a monotonic workspace epoch also reject changes restored to an earlier value.
- The starting full project is cloned. Proposal creation, Preview, and Reject do not mutate the draft or storage. Apply still goes through `workspace.applyProposal()`; Save remains separate.

The editing epoch is ephemeral UI state, not a canonical project field. It is needed because invalid → restored or changed → restored callbacks may occur within one React batch, hiding intermediate states from ordinary props comparisons.

## Verification

Fresh pre-change baselines:

- Existing focused frontend/proposal tests: 170 passed, 0 failed.
- Accepted Stage 1 backend tests: 97 passed, 0 failed.

Final results:

| Check | Result |
| --- | --- |
| Focused frontend regressions, 11 files | 271 passed, 0 failed, 0 pending |
| Focused backend regressions, five files | 131 passed, 0 failed, 0 pending |
| Targeted Playwright, three files | 20 passed; zero unexpected, flaky, or skipped cases; retries disabled |
| Total distinct cases in final selection | 422 passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `npm run verify:bundle` | Passed, including rebuild and credential/provider-endpoint/sentinel boundary scan |
| Prettier for all Stage 2 TypeScript/TSX files | Passed |
| `git diff --check` | Passed; LF-to-CRLF policy warnings only |
| Accepted Stage 1 source hashes | All eight match |
| Final independent static code/security review | Passed, no concerns/errors/suggestions |
| Test ports 5188 and 5189 after browser run | No remaining listeners |

Exact Vitest selections, reporter paths, parsed per-file totals, source hashes, browser case metadata, and review result are in `m3-phase2b-stage2-verification.json`. Baseline and client-only results are subsets/earlier runs, not additional final cases.

Browser command:

```sh
./node_modules/.bin/playwright test e2e/chat-http.spec.ts e2e/chat-editing.spec.ts e2e/chat-context.spec.ts
```

Fresh read-only port checks found no listeners on 5188/5189 before Playwright. Existing configuration refused server reuse. Only owned test fixtures were started; no existing service was stopped or restarted. Each HTTP browser case used an ephemeral loopback protected backend with synthetic injection. The browser still requested same-origin edit URLs; the test harness forwarded them to that real backend. External and unrelated API requests were blocked and asserted absent. Stored projects were seeded once per context, not rewritten on reload.

The eight new browser cases cover the full diff/Preview/Reject/Apply/Save/reload flow, cancellation/duplicate gating, manual edits and Save while pending, switching projects with overlapping block IDs, instruction changes/restoration, disabled-backend offline compatibility, and host semantic rejection after a successful backend response. The other twelve cases preserve deterministic editing and context behavior.

The independent reviewer inspected production changes and unit tests but did not run runtime/browser tests. Execution results above come from parent-run tools. No broader historical 770-test or observability suite was rerun.

## Git preservation

Branch remains `main`; HEAD remains `29ae78d`. Nothing was staged, committed, reset, or rewritten. The cumulative tracked diff also includes the two accepted Stage 1 backend files; they are not new Stage 2 changes. Pre-existing untracked `.npmrc`, documentation, configuration, and the unusual untracked filename were preserved.

## Remaining limitations and risks

- Only the named synthetic fixture is supported. This is the offline integration path, not real natural-language AI acceptance.
- The backend is stateless relative to browser drafts; host snapshot/editing-version checks remain essential. Cross-tab localStorage conflict checks are optimistic, not transactions.
- Cancellation stops client acceptance and signals transport, but does not prove arbitrary provider work stopped. Stage 1 retains shared admission until underlying work settles.
- Arbitrary prose truth/intent is not proven by deterministic grounding; explicit human review remains necessary.
- Operations cannot reference future IDs of newly added blocks. Dependent operations/reordering require a later proposal after host ID assignment.
- Rendering already-approved supplied image URLs may make browser resource requests; URL validity/grounding is not a privacy or trust guarantee.
- Production deployment, remote authentication, broader mobile/browser coverage, edit telemetry, and live-provider capability are not included.

## Stage 3 preparation — not implemented

1. Design a separate edit-specific provider prompt/wire schema and adapter behind explicit server-side live authorization; do not repurpose Website Plan generation.
2. Preserve server-only credentials, exact model/free-only guardrails, zero fallback, and single-attempt budgets.
3. Define context/output token budgets and metadata-only diagnostics, with offline refusal/truncation/schema/deadline tests before live acceptance.
4. Review consent/privacy for transmitting existing website content, and resolve honest live-edit source/provenance UI without changing original website-generation provenance.
5. Obtain fresh approval for any live provider implementation, activation, service restart, and live acceptance test.

Stop after Stage 2. No live provider has been implemented or activated.
