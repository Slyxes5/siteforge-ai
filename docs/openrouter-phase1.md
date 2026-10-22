# OpenRouter Phase 1 — local/mock integration

## Status and scope

Local implementation only. No Gemini/OpenRouter inference, account, key, billing or authenticated model-discovery request is authorized in this phase. Public documentation was consulted. Keep live activation disabled until separately approved.

Source checkpoint before implementation: `backups/openrouter-phase1-20261020-112909.zip` (source only, not a backup of browser projects). No dependencies, paid services, M3 work or UI redesign were added.

The user explicitly approved the sole canonical exception: add `openrouter` to `generation.provider`. Project shape, schemaVersion=1, block definitions, IDs, storage keys and save/reload format remain unchanged; existing Gemini/mock projects remain valid. An older pre-OpenRouter application will reject an OpenRouter-provenance project; retain the updated reader when rolling back the active provider.

## Architecture

```text
Explicit backend provider selection
  ├─ Gemini adapter / existing opt-in Gemini model router (unchanged)
  └─ OpenRouter adapter (single attempt, no cross-provider/model fallback)
       fixed POST https://openrouter.ai/api/v1/chat/completions
       → bounded OpenAI-compatible envelope parser
       → Website Plan v1 validation
       → deterministic SiteForge Compiler
       → original-request grounding + canonical Project v1 validation
       → candidate preview → Puck edits → Apply → explicit Save → reload
```

- `server/openrouter-request.ts`: pure request builder. Validated original name/prompt; no keys or mutable raw `toJSON` input serialized into the body.
- `server/openrouter-provider.ts`: backend-only bearer authentication, one transport invocation, bounded response stream, caller cancellation and deadline (45s by default), controlled error categories. Elapsed checks prevent a blocking response from evading a delayed timeout callback. Resource overrides cannot exceed shared limits. Content must be one unfenced JSON object; reject refusal, tool calls, truncated/ambiguous/multiple choices, wrong returned model, malformed envelope and nonzero reported cost.
- `server/openrouter-settings.ts`: pure public-settings validator; never accesses a credential. Reject paid/unknown models before key lookup.
- `server/config.ts`: explicit `SITEFORGE_AI_PROVIDER=gemini|openrouter`; OpenRouter never enters Gemini routing. No automatic switch on 400, 401, 403, 429, 503, timeout or invalid output. OpenRouter owns a single attempt even if server retry settings are higher.
- `server/generation-server.ts`: sanitized provider/model, attempt/transport count, upstream numeric status and duration. Provider bodies, headers, keys and raw error messages are not returned/logged. Internal timeout maps to backend HTTP504; upstream failures normally map to safe HTTP502 with upstream status in diagnostics.
- Mock transports use `provider=mock` provenance and an OpenRouter transport telemetry alias; they are not presented as real generation. `src/ai/openrouter-provenance.test.ts` separately verifies canonical `provider=openrouter` compile/save/reload compatibility.

## Exact model and structured-output policy

Allowlist contains exactly **`nvidia/nemotron-3.5-super-vl:free`**. The official model page lists this as free input/output. A display name, the paid ID without `:free`, `openrouter/free`, an arbitrary `:free` model or fallback model list is not accepted.

OpenRouter documentation says strict structured-output support is **per endpoint** and can change. Public documentation inspected here does not establish a reliable `structured_outputs` capability guarantee for this exact free endpoint. No inference or authenticated discovery was performed to probe it.

Therefore default `SITEFORGE_OPENROUTER_OUTPUT_MODE=prompt-json`:

- Put the compact Website Plan schema and JSON-only instructions in the system message.
- Omit `response_format`; do not assume native JSON/schema enforcement.
- Parse strictly and validate locally through the unchanged compiler/grounding boundary.
- Fail visibly on invalid output; do not repair by extracting fenced text or sending another request.

Explicit `json-schema` mode is implemented/tested against synthetic transports using `response_format.type=json_schema`, `strict=true` and `provider.require_parameters=true`. It is **not enabled or verified on the real free endpoint**. Do not enable it without capability confirmation and separate authorization. It is not an automatic first attempt or fallback.

## Cost and request safety

Every request explicitly fixes:

- exact allowed free model, no `models` list or automatic model router;
- `provider.max_price={prompt:0,completion:0}`;
- `provider.allow_fallbacks=false`;
- `stream=false`, one completion and bounded output tokens;
- no tools, paid plugins, search or image-generation request.

Live construction requires explicit provider, live opt-in and `SITEFORGE_OPENROUTER_FREE_ONLY_CONFIRMED=true`. Confirmation is an operator attestation, not an account/billing lookup. Keep the account's existing free-only/model guardrail enabled. Reported response cost >0 is rejected, but post-response checking cannot undo a provider charge; request filters plus account-side guardrails are the primary protection. Free capacity, entitlement, rate limits and pricing may change; public price is not an account guarantee.

Free endpoints may retain prompts under provider policies. A future acceptance should use synthetic business data only. Do not send confidential data in this phase.

## Single-request smoke launcher

`server/openrouter-smoke-startup.ts` shares the tested non-refundable `singleUseTransport` guard: maxAttempts=1, rateLimit=1 and a lifetime transport budget=1. Failure/timeout does not refund the budget. Unknown/combined mode flags are rejected. Inherited Gemini routing flags do not enable routing.

Separate entrypoint from Gemini:

```sh
# Local synthetic transport only; no key lookup and no remote generation.
node --import tsx server/openrouter-smoke-start.ts --mock
```

No arguments means disabled, even with inherited live flags. Real mode additionally requires explicit `--live` and all gates; **do not launch it in Phase 1**. There is intentionally no live command in the preparation block below.

The launcher binds loopback only and records numeric transport status/count, provider/model/mode, PID and source fingerprint in `docs/smoke-observations/openrouter-launcher-<pid>.json`. It refuses to overwrite an existing PID ledger. Never infer a successful generation merely from HTTP200 in that transport ledger: compiler/browser acceptance are separate gates. `stopped` can remain false after a forced Windows termination; verify process/port state directly. Gemini's existing observer/ledger format is not a drop-in OpenRouter observer; use provider-specific preflight for a future approved attempt. Restarting a process creates a new budget and is not permission to retry.

## PowerShell 7: preparation only, live remains disabled

Run locally yourself only if you want to prepare a terminal session. Never paste the key into chat, a command literal, `.env`, source, a transcript or `setx`. If the environment variable already exists in this terminal, keep it and do not enter it again. The agent must not inspect its value. This block does not start a backend or make a request.

```powershell
Set-Location 'C:\Projects\siteforge-ai'
$env:SITEFORGE_AI_ALLOW_LIVE = 'false'
$env:SITEFORGE_AI_PROVIDER = 'openrouter'
$env:SITEFORGE_OPENROUTER_MODEL = 'nvidia/nemotron-3.5-super-vl:free'
$env:SITEFORGE_OPENROUTER_OUTPUT_MODE = 'prompt-json'
$env:SITEFORGE_OPENROUTER_FREE_ONLY_CONFIRMED = 'true'
$env:SITEFORGE_AI_ROUTER_ENABLED = 'false'

if (-not (Test-Path Env:SITEFORGE_OPENROUTER_API_KEY)) {
    $secret = Read-Host 'OpenRouter key (local masked input only)' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try {
        $env:SITEFORGE_OPENROUTER_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        $secret.Dispose()
        Remove-Variable secret, ptr
    }
}
Write-Host 'Session prepared; live generation is still disabled.'
```

The backend requires a plaintext credential in its process environment; the temporary secure input/BSTR is cleared, but the environment value remains until you remove it or close this terminal. This is not an encrypted secret vault. Do not enumerate the environment, dump process arguments/headers, run a transcript around entry, or print the variable. To clear only this terminal's prepared key later: `Remove-Item Env:SITEFORGE_OPENROUTER_API_KEY -ErrorAction SilentlyContinue`. No persistent user/system environment is modified.

Provider switching is backend configuration only in Phase 1; no UI selector was added. Keep `SITEFORGE_AI_ALLOW_LIVE=false` while preparing either provider. Switching back to `SITEFORGE_AI_PROVIDER=gemini` retains the existing Gemini adapter/router settings; no automatic switch or running-service restart was performed.

## Verification and remaining gates

Final local results:

| Gate | Result |
| --- | --- |
| TypeScript typecheck | PASS |
| Production build | PASS |
| Client bundle guard, both provider sentinels | PASS |
| UI/domain unit tests | 158 passed, 0 failed |
| Server unit/integration tests | 358 passed, 0 failed |
| Browser E2E | 44 passed, no skipped/flaky/unexpected |
| Browser observability | 26 passed, no skipped/flaky/unexpected |
| Existing Gemini coffee / two-block smoke mock | Both PASS, one synthetic transport each |
| OpenRouter actual CLI disabled / mock | Both PASS, zero / one synthetic transport |

The five OpenRouter browser cases include successful edit/Apply/Save/reload and isolated projects, HTTP400, malformed output, ungrounded contact and timeout. Transport failures remain single-attempt. Screenshot inspection confirmed honest `TEST MOCK — not real AI` labeling and empty contact placeholders. No real generation request was made. After cleanup, 5188/5189 were free; the existing 5178 frontend remained occupied and was not restarted.

RED regressions exposed a late synchronous deadline escape, inherited `toJSON` serialization and missing OpenRouter bundle-name/endpoint guards; these were fixed and verified. The first E2E assertion mistakenly called canonical contact text `intro`; the fixture was corrected to the existing `body` field, without changing project shape.

Machine-readable results and screenshots: `docs/openrouter-phase1-evidence/`. Tests cover free settings, no credential lookup when unselected/disabled/mock, exact API request, prompt/schema modes, refusal/truncation/invalid body, cost/model rejection, HTTP classes without retry, abort/timeout/stalled bodies, elapsed deadline, response ceilings, safe diagnostics, single-use factory and actual CLI startup. Browser tests cover compiler/preview/Puck/Apply/explicit Save/reload/two-project isolation and safe 400/malformed/ungrounded/timeout failures.

Local success proves integration behavior, not real model compliance, entitlement, quota, billing enforcement or latency. Gemini's historical HTTP400 remains unresolved; this adapter does not claim to fix it. The free model reasons by default, so latency/token exhaustion may still cause safe timeout/truncation failures; no model or reasoning parameter was silently changed.

A future real test needs new explicit approval for exactly one POST/outbound, fresh process/source/build/unused-budget checks, a bounded provider-specific browser observer, synthetic scenario, no auto-Save/retry and scoped cleanup. Stop after local Phase 1.

## Official references consulted

- https://openrouter.ai/nvidia/nemotron-3.5-super-vl:free
- https://openrouter.ai/docs/api/reference/overview
- https://openrouter.ai/docs/api/reference/parameters
- https://openrouter.ai/docs/guides/features/structured-outputs
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://openrouter.ai/docs/api/reference/errors-and-debugging
