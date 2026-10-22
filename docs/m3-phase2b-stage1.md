# M3 Phase 2B — Stage 1: synthetic backend structured editing

## Scope and stop point

Implemented against branch `main`, HEAD `29ae78d`, without a commit. Stage 1 adds a synthetic-only backend capability. It does not connect ChatEditor, enable live inference, change canonical Project Schema v1, apply edits, or save projects.

The original mock ChatEditor, `StructuredEditProvider`, `createStructuredEditProposal()`, proposal engine, website-generation adapters, and generation request builder remain unchanged. No running application service was restarted; verification used owned ephemeral loopback test servers.

## Files

Added:

- `src/ai/edit-contract.ts`: strict edit HTTP request, status, and result schemas plus fixed ceilings.
- `server/edit-provider.ts`: edit-specific provider interface, synthetic fixture adapter, independent fail-closed mock configuration.
- `server/edit-validation.ts`: operation target/type checks in detached scratch state; no project/proposal creation.
- `server/edit-server.test.ts`: route/provider/result/lifecycle/host-boundary integration cases.
- `server/edit-security.test.ts`: hostile requests, resource ceilings, admission, cancellation, and storage isolation.
- `server/edit-provider.test.ts`: fixture, explicit startup opt-in, disabled configurations, and credential-isolation cases.

Modified:

- `server/generation-server.ts`: edit routes inside the existing guarded server, shared admission counters, and schema-parameterized bounded request reader. Existing generation decoding remains unchanged; strict UTF-8 decoding is enabled for editing.
- `server/startup.ts`: injects the independently selected synthetic edit provider while retaining loopback binding and existing generation startup behavior.

## HTTP contracts

### GET `/api/edit/status`

Default response shape:

```json
{
  "mode": "disabled",
  "provider": null,
  "sessionToken": "<64 lowercase hexadecimal characters>"
}
```

Explicit mock capability response shape:

```json
{
  "mode": "mock",
  "provider": "synthetic",
  "sessionToken": "<64 lowercase hexadecimal characters>"
}
```

The status route is GET-only and uses the existing Host/Origin/cross-site checks, plus an edit-specific loopback-peer check. As with existing generation status, trusted local non-browser clients may omit Origin. The session token is per server instance, shared with the existing backend security boundary, and never stored in a project.

### POST `/api/edit/propose`

Example request contract:

```json
{
  "instruction": "Set the first heading to \"Welcome\".",
  "context": {
    "name": "Demo",
    "blocks": [
      { "id": "intro", "type": "heading", "text": "Before" }
    ]
  }
}
```

Context permits only `name`, optional `description`, and canonical `blocks`. Unknown fields are rejected, including project identity, persisted revision, snapshots, generation provenance, and saved-project envelopes. Block IDs must be unique and at most 200 characters; canonical block-field and URL validation is reused.

Successful response contract:

```json
{
  "mode": "mock",
  "response": {
    "version": 1,
    "operations": [
      { "op": "update", "blockId": "intro", "changes": { "text": "Welcome" } }
    ]
  }
}
```

`response` reuses `structuredEditResponseSchema`: only bounded update/add/remove/reorder operations. Model-controlled proposal metadata, applied projects, save/apply operations, and IDs on added blocks are rejected. Target existence, exact reorder membership, update field types, and block-count constraints are checked against detached supplied context. Backend output is still untrusted, not a host proposal or approved draft.

Errors have the fixed shape `{ "error": { "code": "...", "message": "..." } }`. Routes return sanitized errors for invalid requests (400), forbidden requests (403), unsupported methods (405), oversized uploads (413), media type (415), busy/rate limits (429), invalid/provider output (502), disabled capability (503), and deadlines (504). Raw requests, provider bodies, exception messages, and credentials are not reflected.

## Synthetic-only provider integration

Normal startup leaves editing disabled unless both public flags are supplied:

- `SITEFORGE_EDIT_PROVIDER=mock`
- `SITEFORGE_AI_TEST_MODE=true`

No flags or credentials were set by this implementation task. Selecting an existing generation provider does not automatically enable editing. The edit configuration reader accesses only these two flags; it never reads credentials, live switches, router settings, or model discovery.

The backend interface extends the existing `StructuredEditProvider` with the literal ID `synthetic`. Construction rejects live-labelled edit adapters at runtime. The default fixture recognizes exactly `Set the first heading to "Welcome".` and updates the first heading; unsupported instructions or a missing heading fail safely. This is a named deterministic fixture, not a natural-language model. Tests can inject synthetic raw responses through `createMockEditProvider()`; no external transport is implemented.

## Limits and security

| Resource | Ceiling |
| --- | --- |
| Instruction | 10,000 JavaScript string characters; nonblank |
| Serialized projected context | 131,072 UTF-8 bytes |
| Whole HTTP request | 196,608 bytes, including chunked uploads |
| Provider response and encoded result wrapper | 131,072 UTF-8 bytes each |
| End-to-end edit deadline | 45,000 ms, including upload, provider, and validation |
| Operations | 1–100 |
| Canonical/context/result block count | At most 200 |
| Referenced/context block ID length | At most 200 characters |
| Default admission | One shared active job; five admitted jobs per minute across editing and generation |

Trusted server options may lower request/response/deadline ceilings, never widen them. Edit processing uses existing JSON-only/session/CORS guards, abortable provider settlement, disconnect cleanup, no-store/nosniff headers, and shared admission/rate counters. Provider settlement remains counted after cancellation/timeout until the provider actually settles, preventing overlap with uncooperative providers. There are no edit retries, repair calls, schema downgrades, provider fallbacks, persistence imports, or generated backend block/proposal IDs.

## Validation boundary and limitations

- The backend is stateless with respect to saved and unsaved browser drafts. It cannot establish whether supplied context is newer than some other tab. Unknown operation targets are rejected against supplied context; authoritative stale-draft detection remains in the preserved host snapshot boundary.
- The future client must pass the response payload through `createStructuredEditProposal()` against its starting draft, then retain Preview → Apply/Reject → explicit Save. Backend success never authorizes application.
- Full grounding and rendered-anchor checks remain in the host proposal engine. Backend validation does not prove prose truth or correct interpretation of intent.
- Added blocks have no model-supplied IDs. Operations in the same response cannot target those future IDs; in particular, reordering after an addition requires a subsequent proposal after host ID assignment.
- No edit-specific event/usage telemetry, HTTP client, async ChatEditor lifecycle, or live provider adapter is included.
- Browser E2E and the historical full 770-test suite were not rerun. Frontend behavior was checked with focused unit/integration regressions because no frontend wiring changed.

## Verification

Pre-change selected server baseline: **141 passed, 0 failed** across six files.

Final runs:

| Check | Result |
| --- | --- |
| New focused backend cases | 97 passed, 0 failed, 0 pending, three files |
| Selected server regressions including new cases | 272 passed, 0 failed, 0 pending, 15 files |
| Existing server regressions within that run | 175 passed |
| Preserved mock/proposal/frontend regressions | 170 passed, 0 failed, 0 pending, five files |
| Distinct tests in final combined selection | 442 passed |
| `npm run typecheck` | Passed |
| `npm run verify:bundle` | Passed; rebuild and client credential/provider-endpoint/sentinel checks |
| Prettier check of all changed TypeScript files | Passed |
| `git diff --check` | Passed; Git emitted only existing LF-to-CRLF policy warnings |
| Final independent code/security review | Passed; no remaining security concerns, logic errors, or suggestions |

Independent review found one validation mismatch: the backend initially rejected add-then-remove replacement at the 200-block boundary before considering the final block count. The narrow fix moved the unchanged ceiling check after the operation sequence; regressions now cover both valid replacement and invalid final overflow. Final review status is recorded in the verification JSON.

Focused backend command:

```sh
./node_modules/.bin/vitest run --config vitest.server.config.ts server/edit-server.test.ts server/edit-security.test.ts server/edit-provider.test.ts --silent
```

Server regression selection additionally included `generation-server`, `generation-observation`, `openrouter-provider`, `openrouter-limits`, `openrouter-config`, `config`, `start`, `routed-generation-provider`, `website-plan-provider`, `openrouter-request`, `openrouter-settings`, and `openrouter-telemetry` test files. Each final run also emitted a machine-readable JSON report; exact commands, totals, report paths, and independent review result are recorded in `m3-phase2b-stage1-verification.json`.

Frontend regression command:

```sh
./node_modules/.bin/vitest run src/ai/structured-edit.test.ts src/ai/edit-proposal.test.ts src/ai/mock-chat-editor.test.ts src/app/ChatEditor.test.tsx src/app/chat-workspace.test.tsx --silent
```

## Proposed Stage 2 — requires separate approval

1. Add a same-origin HTTP-backed `StructuredEditProvider` with strict status/result decoding, cancellation, and bounded response reads. Exercise it with this synthetic backend first.
2. Integrate `createStructuredEditProposal()` into ChatEditor asynchronously with request epochs, pending/cancel controls, immutable starting context, and permanent invalidation on editing-state transitions.
3. Preserve the existing diff, explicit Preview, guarded draft-only Apply/Reject, and explicit Save; add browser workflow/isolation tests.
4. Resolve honest edit-source UI/provenance before any live adapter. Live OpenRouter editing and live acceptance remain separately gated and unimplemented.

Stop after Stage 1; no Stage 2 work is authorized by this document.
