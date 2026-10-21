# Gemini Model Router & Safe Fallback — local delivery

## Scope and status

Implemented and tested locally with synthetic transports. No real Gemini API request, credential lookup, billing activation, paid service, production model switch, UI redesign, canonical storage migration, Cheat Clip Pro access or M3 work was performed.

Source snapshot: `backups/model-router-20261020-103247.zip` (source only, not persisted browser projects). There is no Git metadata in this project directory.

## 1. HTTP 400 diagnosis

### Established evidence

The previous live attempt in `docs/smoke-observations/launcher-21380.json` returned upstream HTTP **400**, `providerRpcStatus: INVALID_ARGUMENT`, category `invalid_request`, failure stage `provider_transport`, and one outbound. SiteForge mapped this to application HTTP 502. Website Plan parsing and compilation were not reached. The raw provider message/details were deliberately not retained, so no exact invalid field can be recovered from that receipt.

**HTTP 400 is not treated as model overload and never triggers fallback.** The new router is not a repair for this unresolved request rejection.

### Payload compatibility audit

Current request:

- API: `POST /v1beta/models/gemini-3.5-flash-lite:generateContent`.
- Header-only application credential; no tools, remote images, paid grounding or model-discovery calls.
- `systemInstruction`, one user `contents` message.
- `generationConfig.responseMimeType: "application/json"`.
- `generationConfig.responseJsonSchema`: existing Website Plan projection.
- `generationConfig.maxOutputTokens: 4096`.

The exact coffee request is unchanged: SHA-256 `c3b1b183a88454429c56af813c9fcbe7f4f85de1951113c78493c349bd29eea1`.

| Parameter/hypothesis | Evidence-based assessment |
|---|---|
| Model lacks structured output | Not supported by official documentation: 3.5 Flash-Lite is explicitly listed as supported. |
| Output token cap is too high | 4096 is below the documented 65536 model output maximum. No evidence of this violation. |
| Enum, required, additionalProperties, minItems/maxItems are unsupported | These keywords are documented for structured output. No unsupported keyword was identified in the current small projection. |
| Schema is too complex | Google warns that very large/deep schemas can be rejected, but no published threshold or error evidence establishes this for our 883-byte schema. Remains a hypothesis, not a diagnosis. |
| Old response configuration is incompatible | Worth investigating: current docs recommend `generationConfig.responseFormat`, while the existing code uses the older MIME/schema fields. However, older fields remain documented and a Go example still uses ResponseMIMEType/ResponseJsonSchema. Deprecation alone does not establish that the model rejects them. |
| Wrong API family/field spelling | No current mixing was found. New generateContent REST examples use `responseFormat.text.mimeType` and `responseFormat.text.schema`; Interactions uses a different top-level `response_format` shape with `type`, `mime_type`, and `schema`. Do not copy Interactions fields into generateContent. |
| Account/key/project configuration | Not inspected. No evidence permits attributing this attempt to billing, entitlement or a key problem. Router must not bypass authentication/client errors. |

The REST GenerationConfig reference is internally awkward around `responseJsonSchema`/`_responseJsonSchema` and deprecation text. The direct generateContent guide's newer shape is a future isolated compatibility hypothesis, NOT an implemented or proven fix:

```json
{"generationConfig":{"maxOutputTokens":4096,"responseFormat":{"text":{"mimeType":"application/json","schema":{}}}}}
```

No request format or generation payload was changed during this milestone. There is no automatic schema-format fallback or repair request.

### Official sources checked

- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- https://ai.google.dev/api/generate-content#GenerationConfig
- https://ai.google.dev/gemini-api/docs/structured-output (Interactions family)
- https://ai.google.dev/gemini-api/docs/troubleshooting

The troubleshooting guide explicitly recommends retry on transient rejection examples such as 429/503 and warns against retrying client errors such as 400/403. SiteForge's policy is deliberately stricter for ambiguous timeout/network outcomes to avoid replay after possible successful processing.

## 2. Model eligibility

| Model | Structured output / public Free Tier | SiteForge disposition |
|---|---|---|
| `gemini-3.5-flash-lite` | Supported; text input/output listed free of charge | Existing primary remains unchanged. Historical request acceptance is still unresolved. |
| `gemini-3.8-flash` | Supported; standard text input/output listed free of charge | Documentation-eligible fallback candidate; NOT enabled in production. Must first be verified for the actual project/contract. |
| `gemini-2.5-flash` | Supported; public free-tier pricing exists | Not in router allowlist. Access is restricted to users who actively used 2.5 previously; not a universal new-project fallback. |
| `gemini-2.5-flash-lite` | Supported; public free-tier pricing exists | Same legacy-access restriction; not allowlisted. |

Only the exact primary and 3.8 Flash IDs are currently allowlisted. Other IDs, including plausible but unverified aliases, fail closed. No model-list or token-count API call was used.

Sources:

- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash
- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite

Public support/pricing is NOT proof of the user's project entitlement, remaining quota, geographic availability, unlinked billing status or successful Website Plan output. Free Tier can share limits across models; fallback does not create extra quota. Production configuration requires explicit operator attestations after appropriate verification. This implementation does not independently query Google billing and cannot guarantee zero charges for an incorrectly attested paid project. This milestone itself used no paid inference and no real provider requests.

## 3. Architecture

```text
Backend explicit opt-in + model eligibility/verification/Free Tier gates
  → reusable createModelRouter<Input, Output>
  → one selected model adapter per attempt (no repeated model IDs)
  → same Website Plan payload
  → bounded provider parsing
  → deterministic compiler + original-input grounding
  → canonical Project v1 with ACTUAL selected model provenance
  → existing browser validation / candidate preview / Puck editing
  → Apply in memory; Save remains explicit
```

### Modules

- `server/model-router.ts`: generic typed scheduler, request validation hook, dispatch reservation, deadlines, cancellation, qualified fallback and safe telemetry callback. Reusable by later AI features without importing Website Plan or project persistence.
- `server/gemini-model-catalog.ts`: conservative exact-ID documentation eligibility catalog; no live entitlement assertion.
- `server/model-router-config.ts`: strict pure backend configuration parser; no credential access.
- `server/routed-generation-provider.ts`: Website Generation adapter composition, request preflight and selected-model return metadata.
- `src/ai/model-routing.ts`: bounded strict metadata schema, shared by server and receipt validation.
- `server/config.ts`: explicit router opt-in; ordinary non-router Gemini backend uses a single adapter attempt to avoid automatic ambiguous replay.
- `server/generation-server.ts`: does not stack HTTP-server retries outside the router; records bounded routing receipts and uses the returned selected model when building canonical provenance. Router timeouts become application TIMEOUT/504 rather than generic provider errors.
- `src/ai/website-generation.ts`, `src/ai/generation-observation.ts`: additive adapter/receipt types, not storage schema changes.

Existing `server/gemini-provider.ts`, `server/website-plan-request.ts`, `src/ai/website-plan.ts` and `src/project-schema/project.ts` remain byte-identical to the source checkpoint. The renderer/editor/persistence implementation is unchanged.

## 4. Fallback policy

| Outcome | Automatic fallback? |
|---|---|
| Explicit upstream HTTP 429 rejection | Yes, if configured alternative is verified/eligible, budget remains and Retry-After fits total deadline. |
| Explicit upstream HTTP 503 rejection | Same bounded rule. |
| Timeout before outbound dispatch | May switch; the aborted prior attempt's dispatch callback is fenced, so it cannot later send. |
| Timeout after dispatch | No. Provider may already have processed it. |
| Network failure / connection loss / response-body failure | No. Delivery/processing can be ambiguous. |
| HTTP 400 / 401 / 403 | Never. |
| HTTP 404 / 500 / 502 / 504 or other status | No in this conservative initial policy; only 429/503 are allowlisted. |
| Refusal, malformed JSON, truncation, invalid Website Plan, compiler/grounding rejection | No. Do not turn successful provider processing into another generation. |
| User cancellation / exhausted total deadline | No. |

Safety properties:

- Maximum **two model attempts and two dispatch reservations** per router run, configurable down to one.
- Model IDs cannot repeat; each provider has one transport callback, guarded against duplicate dispatch.
- Config is snapshotted to prevent later caller mutations extending timeouts or budgets.
- Default router total deadline 60000 ms and per-attempt deadline 30000 ms; total hard cap 90000 ms.
- Retry-After is honored when it fits the remaining deadline; otherwise stop. With one possible transition, the router uses a bounded delay, not an unbounded retry/backoff loop.
- Parent cancellation propagates, listeners/timers are cleaned up, and late completion/dispatch is fenced.
- No provider-native idempotency guarantee is assumed. The policy only transitions on explicit transient HTTP rejection or provably undispatched timeout. It cannot guarantee provider internal side effects or billing semantics, so uncertain outcomes stop.
- The primary model is never silently replaced by an available-looking alias.
- Router selection is not permission for real requests. Live activation/quota use still requires separate approval.

### Single-request smoke remains independent

`server/smoke-startup.ts` and `server/smoke-start.ts` are unchanged. They construct the direct adapter, **not the model router**, with `maxAttempts=1`, `rateLimit=1` and the non-refundable `outboundLimit=1` transport latch. Even inherited router-enable/fallback/verified flags cannot broaden that budget. No live launcher was started during this milestone.

## 5. Configuration (backend only; do not activate now)

Default: `SITEFORGE_AI_ROUTER_ENABLED` absent or not exactly `true` means no automatic fallback. Existing `SITEFORGE_GEMINI_MODEL` selects the primary; default remains `gemini-3.5-flash-lite`.

| Variable | Meaning |
|---|---|
| `SITEFORGE_AI_ROUTER_ENABLED` | Explicit opt-in; leave unset/false until separately authorized verification. |
| `SITEFORGE_AI_FALLBACK_MODELS` | JSON array of exact allowlisted alternatives, e.g. `["gemini-3.8-flash"]`. |
| `SITEFORGE_AI_VERIFIED_MODELS` | JSON array containing every configured model, only after actual project/contract checks under separate authorization. This is operator attestation, not automatically inferred evidence. |
| `SITEFORGE_AI_FREE_TIER_CONFIRMED` | Must be exactly `true`; confirms operator has verified the dedicated free project. Not a billing API check. |
| `SITEFORGE_AI_ROUTER_MAX_ATTEMPTS` | 1–2, default 2. |
| `SITEFORGE_AI_ROUTER_ATTEMPT_TIMEOUT_MS` | Positive integer, default 30000, no greater than total. |
| `SITEFORGE_AI_ROUTER_TOTAL_TIMEOUT_MS` | Positive integer up to 90000, default 60000. |

Missing verification, unknown/duplicate models, malformed lists, missing Free Tier attestation or invalid limits reject construction before outbound. No configuration file, key, live flag or production model was set by the agent. Do not mark a model verified merely because its public documentation exists. Future deployment must preserve the separate live/quota approval gate.

## 6. Safe telemetry

Optional `diagnostics.routing` reaches the existing validated backend receipt and terminal event:

- `selectedModel` (null until an adapter returns text).
- `outboundRequests` (dispatch reservations; not proof of provider processing or billing).
- At most two attempts with model ID, reason (`primary`, `http_429`, `http_503`, `pre_dispatch_timeout`), outcome, outbound 0/1 and optional numeric provider status.

No prompt, API key, headers, raw provider body, arbitrary error string or request content is added. Schema enforces total/count/selected-model consistency. An adapter outcome `returned` does NOT claim that Website Plan/grounding succeeded: those later checks remain separately visible. Old receipts without `routing` remain valid.

## 7. Verification

Final local verification:

- Typecheck: passed.
- Production build: passed.
- UI/domain unit/integration: **156 passed**.
- Server unit/integration: **256 passed**.
- Main browser E2E: **39 passed**.
- Observability browser E2E: **26 passed**.
- Coffee smoke mock: **1 passed**, three blocks, one synthetic dispatch, preview and pre-Save editing verified.
- Two-block smoke mock: **1 passed**, two blocks, one synthetic dispatch.
- Bundle guard: passed; checked backend credential patterns, endpoint/header markers and injected sentinel absent from client artifacts.

Coverage includes primary success, qualified fallback success, all models failing, forbidden statuses, invalid request, unsupported/unverified model, strict configuration, attempt/dispatch budgets, noncooperative timeout, pre-dispatch-only timeout fallback, late callback fencing, cancellation/listener cleanup, Retry-After exhaustion, configuration mutation, safe telemetry, actual selected-model canonical provenance, grounding rejection after fallback and invalid output without fallback. Server integration sets the outer HTTP attempt option to two and verifies it still does not stack retries around router-owned attempts.

New browser tests traverse an owned ephemeral loopback server with actual adapters and synthetic transports: primary 503 → fallback success → Website Plan → compiler → browser preview → Puck editing → Apply, storage unchanged. HTTP400 makes exactly one synthetic call; all-fail makes exactly two. The fixture is clearly marked TEST MOCK, not real AI. Existing Save/reload/multi-project/corrupt-storage regressions remain passing.

Screenshot `docs/model-router-evidence/model-router-preview.png` shows the synthetic Hero, two service items, empty Contact indicators and locally edited body after Apply; no blank render. It does not prove real Gemini acceptance.

Smoke receipts:

- `docs/smoke-observations/mock-db433f70-5272-421a-b523-984e3ae4c615.json`
- `docs/smoke-observations/mock-beae6122-f7af-45a8-94dd-15ee963f4afa.json`

Test ports 5188/5189 were verified free after cleanup; pre-existing frontend 5178 remains listening and was not restarted/stopped.

## 8. Remaining boundary

Local router work is complete. HTTP400 remains unresolved; do not attempt to route around it or call it overload. A future, separately approved investigation can test one explicitly selected request-format hypothesis with the single-request launcher and safe evidence, or verify the alternative model/project contract. No such request is authorized or performed by this delivery. Do not start M3.
