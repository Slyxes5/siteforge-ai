# Single-request Gemini smoke launcher — preparation only

## Approval boundary

The dedicated SiteForge key is already in the user's Windows PowerShell 5.1 process environment. Do not ask for it again, print it, copy it from another project, or store it in a file. The agent has not read that key. Implementation and synthetic verification are approved; **live activation and real Gemini requests are not approved**.

Checkpoint before these additions: `.milestones/m2b-phase1-before-single-smoke/`. It contains source/config/docs only, not credentials, dependencies, build output or browser data.

## Delivered files and isolation

- `server/smoke-startup.ts`: separate server factory and single-use transport budget.
- `server/smoke-start.ts`: loopback CLI entrypoint and owned-process shutdown.
- `server/smoke-startup.test.ts`: focused transport, HTTP pipeline, gating and CLI tests.
- `package.json`: `backend:smoke` and `test:smoke` aliases; no new dependency.

The Gemini adapter, frontend, canonical schema and persistence remain separate from this launcher. Following the local model-router milestone, the normal backend defaults to a single adapter attempt; explicit model routing owns its own bounded budget and is disabled by default. Always use this dedicated launcher for a one-request smoke: it bypasses the router and enforces a non-refundable transport limit of one. See `gemini-model-router.md` for the current routing policy.

## Hard request limit

The smoke factory explicitly passes `maxAttempts: 1` to the existing generation server. There are no automatic retry attempts. A transport-level latch reserves its only call synchronously, before awaiting network I/O, and is never refunded after an HTTP failure, malformed output, cancellation after dispatch or network failure. Concurrent and subsequent calls cannot reach the underlying transport. Expiration of the HTTP rate-limit window does not reset the transport latch.

The existing Gemini adapter uses the fixed official `generateContent` URL and `redirect: "error"`; no redirect follow-up is allowed. Status checks are local and do not probe Gemini. No model-list, token-count, repair, fallback-model or provider-health requests are performed. Backend request validation/response validation and candidate preview remain in force; nothing is auto-saved.

The budget is **per launcher process**, not a durable global quota. Restarting the launcher creates a new budget and requires a new authorization after an attempted live test. Do not launch a second process, use the standard backend, or retry manually to bypass the budget. A counted transport dispatch is not proof Google received/completed a request; failed/timeout attempts may still consume quota. Stop rather than retry.

## Modes

| Command/selection                 | Behavior                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run backend:smoke`           | Disabled, even if inherited live flags/key are present                                    |
| `npm run backend:smoke -- --mock` | Synthetic Gemini-format transport response; explicit mock provenance; no external request |
| Explicit `--live` selection       | Refused unless all live prerequisites below are present; not approved to run now          |

In disabled/mock CLI modes the child's copy of `SITEFORGE_GEMINI_API_KEY` is removed without reading its value. The parent PowerShell key is unaffected. Mock mode uses a synthetic credential and deterministic Gemini-shaped response to exercise the real adapter/parser/validator, but candidate provenance is `provider="mock", mode="mock"`. The output is visibly TEST MOCK, not real AI.

Default model: `gemini-3.5-flash-lite`. Override with `SITEFORGE_GEMINI_MODEL` before launching, without changing code. Invalid model IDs fail closed. A model name in local status is not evidence of account access or real generation.

### Additional live gates — do not enable now

The launcher requires all of these for its future live mode:

- exactly one explicit `--live` argument;
- `SITEFORGE_AI_PROVIDER=gemini`;
- `SITEFORGE_AI_ALLOW_LIVE=true`;
- test mode not `true`;
- `SITEFORGE_SMOKE_FREE_TIER_CONFIRMED=true`;
- the dedicated backend key already available.

The free-tier flag is an **operator attestation**, not an automated Google billing check. Leave it false during preparation. No live activation command is needed or authorized at this stage.

## Safe commands from the PowerShell session that already has the key

No key entry or key output is needed:

```powershell
Set-Location 'C:\Projects\siteforge-ai'
$env:SITEFORGE_AI_ALLOW_LIVE = 'false'
$env:SITEFORGE_SMOKE_FREE_TIER_CONFIRMED = 'false'
$env:SITEFORGE_GEMINI_MODEL = 'gemini-3.5-flash-lite'
npm run test:smoke
```

The test suite injects synthetic credentials/responses and blocks native external fetch in both the test runner and tested child processes. It never uses the parent's real key for generation. A synthetic live-configuration constructor test does not listen or invoke its transport; no real process live setting is enabled.

To check disabled launcher startup:

```powershell
npm run backend:smoke
```

Expected startup includes `mode=disabled`, `maxAttempts=1`, `outboundLimit=1`. Stop this owned launcher with Ctrl+C before launching another mode. The default port is 5188; if occupied, the launcher fails rather than stopping or replacing another service. Do not kill another project's process.

For an optional mock-only preview:

```powershell
npm run backend:smoke -- --mock
```

Expected startup includes `mode=mock` and an explicit TEST MOCK transport notice. Use the existing frontend at `http://127.0.0.1:5178` (or start it from a different terminal without the key). Open Generate website, use a synthetic prompt, and generate once. The candidate is TEST MOCK and is not saved automatically. The second generation is blocked locally; do not restart to repeat a future live attempt without new approval.

Do not run frontend builds/dev commands in the credential-bearing PowerShell window. Do not dump environment variables, enable HTTP/body diagnostics, use `setx`, paste keys into commands/chat, or enable command/environment recording that captures secrets.

## Model and free-tier prerequisites

Official documentation identifies `gemini-3.5-flash-lite`; the pricing table lists free-tier input/output for the model. This does not establish this user's project eligibility, current quota, geographic availability or billing state. A key does not encode a reliable free-tier guarantee.

Before any separately approved live attempt, manually check the selected dedicated SiteForge project in Google AI Studio/Google Cloud: Free Tier, correct project/key association, no linked paid billing account, and available free model quota. Do not set up billing, buy credits, enable auto-reload, upgrade tiers or unlink a billing account used by unrelated services. If free access is unavailable or payment is required, stop and keep live disabled. No paid fallback is implemented by this launcher.

References:

- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/billing

## One future smoke scenario — authorization still required

- Name: `SiteForge Smoke Test`
- Prompt: `Create exactly two blocks: one heading titled "SiteForge smoke test" and one short paragraph saying this is synthetic test content. Do not include links, images, contact details, prices, or factual business claims.`
- Exactly one generation submission; no preliminary Gemini probe or retry.
- Preserve existing project data; inspect the separate validated candidate only. Do not Save.
- Record only sanitized status, timing, model, block count and validation outcome. No key, raw provider body or confidential prompt logs.
- Whether success, refusal, 429, timeout or malformed output: stop after that attempt. Any follow-up request needs separate approval.

The existing caps remain: 4096 output tokens, 45-second attempt deadline, 90-second total deadline and bounded request/response size. Schema validity does not establish factual or visual quality.

## Verification completed — synthetic only

Executed successfully:

- `npm run test:smoke`: **20 tests passed**. Tests cover synchronous/concurrent budget reservation, no retry for 429/500/network/invalid JSON, non-refundable budget after errors/cancellation, rate-window expiration, model override, invalid arguments, all live gates, and default-disabled behavior even with inherited live settings.
- The CLI entrypoint was exercised in owned Node child processes in disabled/mock mode, including status and generation HTTP calls. External native fetch is blocked in both runner and child; child environments use only synthetic credentials. Non-live credential-environment removal is asserted before readiness is accepted.
- `npm run typecheck`: passed.
- `npm test`: **63 frontend/domain tests** and **82 server tests** passed; the server count includes the focused smoke tests, not additional real-provider checks.
- `npm run verify:bundle`: production build passed; synthetic backend-key sentinel, checked credential patterns and backend-only Gemini markers absent from client artifacts.
- `npm run test:e2e`: **28 mock-only browser tests passed**, retaining M1/M2A/M2B regressions.
- Compared with the checkpoint: existing source/test files in `src/`, `server/`, `scripts/` and `e2e/` remain byte-identical; only new launcher/test files were added there. `package-lock.json` is unchanged and no dependencies were installed.
- Test-service ports 5188 and 5189 were closed after test cleanup. Owned subprocesses are stopped by test teardown; no unrelated service was stopped.

No real Gemini request was sent; no real key was read or requested again, billing was not enabled, and live mode was not activated in an actual service. The synthetic constructor-only live-configuration test never listens or invokes its transport. Google account/project entitlement and actual model access remain unverified.

## Cleanup

After the current disabled/mock check, Ctrl+C stops only that launcher. It closes its owned HTTP connections; it never stops the frontend or another backend. There is no need to delete a key that the user intentionally prepared in the parent shell just to finish a mock test.

Keep/restore the parent shell's disabled flags:

```powershell
$env:SITEFORGE_AI_ALLOW_LIVE = 'false'
Remove-Item Env:SITEFORGE_SMOKE_FREE_TIER_CONFIRMED -ErrorAction SilentlyContinue
```

After a future authorized real attempt, stop that launcher first. Updating environment flags does not reconfigure a provider already captured in a running process. When the key is no longer needed, remove it from the parent shell without displaying it:

```powershell
Remove-Item Env:SITEFORGE_GEMINI_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:SITEFORGE_AI_PROVIDER -ErrorAction SilentlyContinue
```

Closing the credential-bearing PowerShell window also ends its process-scoped environment. Environment removal is not a guarantee of zeroized process memory. Cancellation/cleanup cannot undo a request already sent or quota already consumed.

If a disabled service is wanted afterward, launch `npm run backend:smoke` with no arguments. Read only the local status mode:

```powershell
(Invoke-RestMethod 'http://127.0.0.1:5188/api/generation/status').mode
# Expected when the disabled launcher is running: disabled
```

If the launcher was stopped and not restarted, connection refusal is expected, not a status response. Do not print the entire status object, which includes a transient local session token.
