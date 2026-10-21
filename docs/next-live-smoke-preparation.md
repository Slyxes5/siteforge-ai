# Next live smoke test — prepared, not authorized yet

> Historical preparation record. The subsequent PID 5808 live attempt failed validation and consumed its approval. Current code, verification and readiness are documented in [M2B validation RCA](m2b-validation-rca.md) and [current readiness](m2b-validation-readiness.json). Older fingerprints/results below describe the preparation baseline, not the post-fix build. The startup/cleanup workflow remains applicable only after fresh explicit approval.

## Current result

Engineering preparation is ready for a fresh, explicitly approved single Gemini request. **No real Gemini request was made and no live service was enabled during this preparation.** The previous permission remains spent. A new approval is mandatory; do not execute live startup or `--live-approved` observation now.

No key was read/requested, no dependency was installed, and no M3/UI redesign was performed. Source checkpoint: `.milestones/m2b-before-next-smoke-preparation/`.

## Verified current path

The new command `npm run smoke:observe -- --mock` rebuilt the current frontend and ran a real browser against a fresh production preview on `127.0.0.1:5189` and the existing single-request launcher in explicit mock mode on 5188. It uses the current bounded `observeGeneration()` helper, not the old ad-hoc observer. The run verified one guarded POST, exact synthetic request data, HTTP 200, success, canonical schema valid, one synthetic transport call, two blocks, visible candidate, unchanged isolated localStorage and no Save click.

The safe evidence contains SHA-256 fingerprints of the build entry and relevant backend/frontend/observer source files. Current file contents were compared with those fingerprints and matched. Active backend observability is also demonstrated by the returned server diagnostics, request ID and transport count; a source hash alone is not treated as proof of runtime behavior.

A small metadata issue discovered in preparation was fixed and regression-tested: a local timeout duration must not be labeled server processing duration. UI receipts now mark diagnostics origin, and `serverDurationMs` is null unless the receipt actually comes from backend diagnostics. No visual redesign was needed.

## Automated runner and bounds

New files:

- `scripts/run-smoke-observer.ts`: disabled by default; accepts explicit `--mock`, or `--live-approved --pid=<PID>` only. Unknown/mixed/malformed options fail closed. The CLI deletes its own inherited copy of the provider key without reading its value and passes only an allowlisted, credential-free child environment.
- `playwright.smoke.config.ts`: one test, one worker, no retries, fresh production preview, no network trace; 135-second test deadline, 155-second suite deadline and a 175-second wrapper bound. Use an enclosing tool deadline of at least 180 seconds. The existing observer has its own 105-second bound. Results are persisted before screenshot/teardown.
- `e2e/smoke-workflow.spec.ts`: verifies backend mode/model, validates the specified live launcher PID locally, rejects a stale pre-observability frontend, allows exactly one synthetic POST through its browser request guard, uses the shared bounded observer, and never clicks Save. A non-success result is recorded and stops the run without retry.
- `server/smoke-runner.test.ts`: explicit-mode/PID parsing and disabled-by-default tests.

For live observation the runner starts only its own preview, not a backend. The credential-bearing backend remains in the user's PowerShell. In mock mode it owns and cleans up both mock backend and preview. Occupied ports cause failure, never replacement or termination of another service. Browser/storage are isolated from the user's normal Chrome profile.

Each live launcher PID has an exclusive ledger at `docs/smoke-observations/launcher-<PID>.json`, created before submission. If that ledger already exists, the runner refuses to reuse it. Do not delete the ledger to bypass the guard. Mock runs receive unique mock-only ledgers. There is no automatic second click, model fallback, provider probe or token-count request.

The browser guard is additional protection, not a replacement for the backend's hard budget. The actual single-request launcher and its tests are byte-identical to the checkpoint: `maxAttempts: 1`, synchronously reserved single transport call, no refund after errors. `package-lock.json` is unchanged.

## Local checks executed autonomously

| Check | Result |
| --- | --- |
| CLI with no selection | Disabled; no generation |
| Typecheck | Passed |
| Launcher tests | 20 passed |
| Full frontend/domain suite | 73 passed |
| Full server/observer suite | 114 passed |
| Production build | Passed |
| Bundle sentinel/security check | Passed |
| Existing browser regressions | 28 passed |
| Observability fault browser suite | 10 passed |
| Complete new runner through mock launcher | 1 passed |
| Total browser checks | 39 passed, aggregated from the JSON reports |
| Source/build fingerprints | Match latest mock evidence |
| Test ports after cleanup | 5188 and 5189 closed |

The launcher test count is included in the server suite; it is not an additional set of real requests. Mock faults include 429/500, malformed output, cancellation, provider stream stall and HTTP delivery stall. No real provider availability/quota was probed.

Machine-readable verification: [next-live-smoke-readiness.json](next-live-smoke-readiness.json). The linked latest mock ledger and screenshot show the exact path that will be used next.

## Minimal user action after NEW approval only

Do not run this block during preparation. After you explicitly authorize one new real request, run it in the same PowerShell session that already holds the dedicated SiteForge key. Do not print/re-enter/send the key. No repeated key, billing, manual status or cross-host checks are requested.

```powershell
Set-Location 'C:\Projects\siteforge-ai'
$env:SITEFORGE_BACKEND_PORT = '5188'
$env:SITEFORGE_GEMINI_MODEL = 'gemini-3.5-flash-lite'
$env:SITEFORGE_AI_PROVIDER = 'gemini'
$env:SITEFORGE_AI_TEST_MODE = 'false'
$env:SITEFORGE_SMOKE_FREE_TIER_CONFIRMED = 'true'
$env:SITEFORGE_AI_ALLOW_LIVE = 'true'
try {
    node --import tsx server/smoke-start.ts --live
} finally {
    $env:SITEFORGE_AI_ALLOW_LIVE = 'false'
    Remove-Item Env:SITEFORGE_SMOKE_FREE_TIER_CONFIRMED -ErrorAction SilentlyContinue
}
```

Keep that terminal and Node process running. Ctrl+C stops the backend; it is not a startup-completion step. Do not click Generate, restart the launcher, or run tests while the live attempt is pending. If another service owns 5188, stop and report rather than killing it.

The agent will verify readiness/PID locally, own the fresh preview/browser, submit once, validate/observe, save safe evidence and report. You do not need to perform those checks again. After reporting, stop only the live launcher when requested so the `finally` block restores the disabled flag. The parent key can remain private in the shell; no persistent/global environment change is needed.

## Agent-side future command — not approved to execute now

After fresh approval and verification of the actual live launcher PID, the agent uses:

```text
npm run smoke:observe -- --live-approved --pid=<verified-live-launcher-PID>
```

Replace only the PID with the actual verified identifier. No key is passed to this command or to the frontend. It rebuilds before serving, so it does not depend on an older dev tab at port 5178 or an existing preview process. The exact model must be `gemini-3.5-flash-lite`; mismatch stops before submission. The runner does not activate live mode itself.

Prompt is fixed in the runner:

> Create exactly two blocks: one heading titled "SiteForge smoke test" and one short paragraph saying this is synthetic test content. Do not include links, images, contact details, prices, or factual business claims.

All errors, deadline expiry, invalid schema, unexpected block count or missing preview end the attempt without another request. A terminal observer error is not presented as proof of a provider error. Diagnostics with unknown server timing/transport count remain unknown. Transport calls do not prove provider acceptance or billing.

## Boundary

Ready means the current mock-tested execution path and single-request safety controls are prepared. It does not establish real model availability, account acceptance, current free quota or latency. Existing user confirmation of the dedicated Free Tier project is retained; no paid upgrade or model fallback is allowed. The historical first live result remains inconclusive and unchanged.

Stop after this preparation. Only a new explicit approval permits one real request. No M3 or redesign is part of this work.
