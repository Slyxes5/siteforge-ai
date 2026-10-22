# M2C provider HTTP error RCA and local verification

## Executive result

Local diagnosis is complete. **The historical provider rejection is not resolved or retrospectively identified.** The original Gemini HTTP status is absent from the available persisted PID 18104 evidence. No Gemini generation request was sent during RCA, no credential was read/requested, no billing was enabled and no model was replaced.

Two observability defects were reproduced and fixed with failing-then-passing tests:

1. The backend already retained upstream HTTP status, but the UI and bounded observer did not expose/persist it. New status-only category/retryability metadata now travels through adapter error → backend receipt/finish event → validated client → UI status attributes → observer ledger.
2. The standard two-attempt backend could retain HTTP 429 from an earlier attempt even when its next attempt succeeded. HTTP metadata is reset when each actual provider attempt begins. This changes telemetry, **not retry counts or authorization**. The single-request launcher still never retries.

No proven request-format bug was found. Request format, model, endpoint, generation limits, canonical schema, visual editor and candidate editing behavior were not changed speculatively.

## Historical evidence and what cannot be recovered

| Evidence | M2B PID 17204 | M2C PID 18104 |
| --- | --- | --- |
| Model | gemini-3.5-flash-lite | gemini-3.5-flash-lite |
| SiteForge HTTP | 200 | 502 |
| Outcome | success | provider_error |
| Stage/reason | None | provider_transport / HTTP_ERROR |
| Configured outbound transport calls | 1 | 1 |
| Output schema | valid | not_attempted |
| Validated blocks | 2 | Unknown |
| Candidate preview | Visible | Absent |

Sources: [M2B ledger](smoke-observations/launcher-17204.json), [M2C ledger](smoke-observations/launcher-18104.json), and [M2C outcome/cleanup](m2c-live-acceptance-result-18104.md). Those historical ledgers are preserved unchanged.

The adapter's `!response.ok` path cancels the upstream body, creates `ProviderError("HTTP", response.status, ...)`, and the backend maps this to its own HTTP 502. Thus HTTP_ERROR establishes an upstream non-success HTTP response, not a malformed generated website. The adapter possessed the original status at runtime and the backend code included it in receipts/console finish events. However, the saved PID 18104 ledger, saved Playwright JSON report and UI snapshot did not contain it. No durable capture of that user-owned backend console was available. The original number must remain **unknown**; SiteForge 502 is not evidence that Gemini returned 502.

No provider response body, key, session token, authorization header or raw prompt/response was recovered or solicited. Canonical/grounding validation was not reached in this live failure and is not its observed failure boundary.

## M2B vs M2C contract comparison

The two-block scenario is historically verified: `.milestones/m2b-before-m2c/e2e/smoke-workflow.spec.ts` matches the SHA-256 in the successful PID 17204 ledger. Its provider/schema/system-prompt files were **not fingerprinted in that old ledger**. Those snapshot files are a useful baseline, not proof of a byte-identical historical upstream payload. The five M2C request-defining files (adapter, prompt, content schema, limits and coffee scenario) still match PID 18104 fingerprints exactly after RCA.

| Aspect | Snapshot baseline M2B | M2C at PID 18104, preserved during RCA |
| --- | --- | --- |
| Requested blocks | Exactly heading + short synthetic paragraph | Exactly hero → features → contact |
| Fixed scenario | SiteForge smoke test; synthetic text, no facts/assets | Synthetic Indonesian coffee shop; two grid features; CTA to Contact; empty email/phone/address |
| System prompt | Inline generation/safety instruction | Separate prompt contract v2 with composition and grounding requirements |
| Content union | heading, paragraph, button, image, hero, section | Same six plus features/contact |
| Exported JSON Schema bytes | 3547 | 5295 |
| Endpoint | POST v1beta/models/{model}:generateContent | Same |
| Request envelope | systemInstruction.parts + one contents user Part containing JSON.stringify(request) | Same |
| Structured configuration | responseMimeType application/json + responseJsonSchema | Same fields |
| maxOutputTokens | 4096 | 4096 |
| Smoke attempts/transport budget | 1 / 1 | 1 / 1 |
| Tools or executable generated code | None | None |

Schema byte counts were computed by importing both snapshot/current schemas with the installed dependencies, not by estimating tokens. Schema keywords remain in the documented subset. Increased schema size/complexity or a parameter rejection remains a possible hypothesis, **not an established cause**. Offline validation and a mock cannot prove Gemini accepted that schema.

## Official model and REST documentation check

Public documentation was retrieved without calling an authenticated/model generation endpoint:

- [Model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) explicitly lists stable model code `gemini-3.5-flash-lite` and structured-output support. This does not establish current account access, quota or billing state.
- [GenerateContent REST reference](https://ai.google.dev/api/generate-content#GenerationConfig) documents POST `https://generativelanguage.googleapis.com/v1beta/{model=models/*}:generateContent`. The existing adapter URL, `systemInstruction` and `contents` envelope follow that API family. Header-only credential handling and redirect rejection remain unchanged.
- The reference includes `responseJsonSchema` in GenerationConfig. Current explanatory text is inconsistent: the deprecated `_responseJsonSchema` section contains the subset and points to `responseFormat`, while `responseJsonSchema` has a self-referential description. That alone does not prove the existing field is rejected. Both compared contracts use the same field. No migration was made on this ambiguous evidence.
- The [structured-output guide](https://ai.google.dev/gemini-api/docs/structured-output) now also shows Interactions-style examples. Those request shapes must not be mixed into this GenerateContent adapter without a separate verified change.

No automatic model substitution, live discovery call or speculative structured-output configuration change was made.

## Safe HTTP telemetry contract

New `src/ai/provider-http.ts` defines a bounded, status-only classification. Existing optional `providerStatus` is retained; new optional `providerErrorCategory` and `providerRetryable` must be supplied together and agree with the status. Legacy receipts containing only a numeric status remain readable. Unknown fields, arbitrary category strings, inconsistent retryability and invalid numeric statuses are rejected. UI-derived metadata is persisted only when it validates and originates from a server receipt; unknown metadata remains null.

| Provider HTTP | Safe category | Potentially retryable under existing policy |
| --- | --- | --- |
| 400 | invalid_request | false |
| 401 / 403 | authorization | false |
| 404 | model_unavailable | false |
| 429 | rate_limit_or_quota | true |
| 500–599 | provider_failure | true |
| Other HTTP errors | other_http | false |

These are operational classifications, not complete causes. In particular, 404 does not prove the model ID is misspelled rather than unavailable/inaccessible or the resource/path not found; 429 does not distinguish short-window throttling from exhausted quota. Potentially retryable **does not authorize a retry** or guarantee that retrying helps. The dedicated smoke path remains `maxAttempts: 1` with a non-refundable lifetime transport budget of one.

No upstream body is parsed/read to classify HTTP errors: cancellation is retained. Raw error strings, response status text, headers, keys and retry-after header values are not serialized into the new metadata. SiteForge HTTP status and upstream provider status remain separate fields. Network, output-validation, timeout and cancellation states remain distinct; non-HTTP failures do not receive an invented HTTP category/status.

## Changed files

- New `src/ai/provider-http.ts`: shared safe classification and validation.
- `server/provider-error.ts`, `server/generation-server.ts`: derived HTTP metadata, receipt/finish propagation, stale-attempt cleanup; valid-status retry policy unchanged.
- `src/ai/generation-observation.ts`: additive, strict diagnostics validation.
- `src/app/WebsiteGenerator.tsx`: only safe diagnostic status text/data attributes; no editor, layout redesign or persistence change.
- `e2e/generation-observer.ts`: bounded validated metadata capture, no response-body wait/read.
- `e2e/smoke-workflow.spec.ts`: fingerprints also cover the classification/error/diagnostic contract files; existing PID ledger and submission guards unchanged.
- `server/observability-fixture.ts`, `e2e/observability.spec.ts`: mock HTTP matrix, end-to-end metadata and privacy assertions.
- New `server/provider-http.test.ts`; additional regression cases in server observation/observer and frontend client tests.
- README and this report/readiness record document the current result.

Checkpoint: `.milestones/m2c-before-provider-http-rca/` (104 source/config files, no environment files, credentials, dependency folders or saved browser projects). Launcher/startup/guard tests, model adapter wire format, prompt v2, canonical schema, Puck config/adapters, candidate editor, grounding/content validators, scenario/runner selection and package manifests/lockfile are byte-identical to that checkpoint. No new dependencies were installed.

## Reproduction and complete verification

RED→GREEN evidence:

1. HTTP400 receipt/finish test initially failed because category/retryability were absent, then passed after shared classification.
2. Retry429→success test initially failed because successful diagnostics still contained providerStatus429, then passed after resetting per attempt.
3. Observer test initially lost all supplied safe HTTP metadata, then passed after validated DOM capture.

Injected HTTP matrix covers **400, 401, 403, 404, 429, 500, 502, 503, 504, 599, 418 and 307** through the actual unchanged smoke-server factory. Each failure dispatches one mock transport; a second local submission cannot consume another provider call. Tests prove body cancellation, no body-reading methods, safe exactly-once finish events, and no raw synthetic secrets. Negative client/DOM tests reject arbitrary and inconsistent metadata.

| Final check | Result |
| --- | --- |
| Typecheck / production build | PASS |
| Frontend/domain/UI tests | 118 PASS |
| Server/provider/integration/observer tests | 158 PASS |
| Focused single-request guard suite | 20 PASS, included in server total |
| Existing/M2C browser regression suite | 35 PASS |
| Fault/observability browser suite | 23 PASS |
| Browser regression total | 58 PASS |
| Bundle safety and injected-sentinel check | PASS |
| Legacy two-block production mock observer | PASS |
| Three-block coffee production mock observer, editing before Save/no storage changes | PASS |

The first browser run exposed a privacy-test false positive: the old broad `authorization` keyword pattern matched the newly allowlisted category value. It now checks for an authorization **header key**, while strict schema/unknown-field rejection and synthetic-secret checks remain. The complete suite was rerun successfully, not merely that assertion.

Artifacts: `test-results/m2c-provider-rca-unit.json`, `test-results/m2c-provider-rca-server.json`, `test-results/results.json`, `test-results/observability-results.json`. Representative HTTP400/429 screenshots were visually checked: safe status/category/retryability and transport1 are visible, no candidate/raw body is shown, and Generate is restored after terminal failure.

Latest [legacy mock ledger](smoke-observations/mock-342c7f17-5263-452f-86b3-ac035c15e70f.json) and [coffee mock ledger](smoke-observations/mock-c507a90c-82e1-4b88-9318-f326b2a33faf.json) exercise the current production bundle. Current fingerprints and machine-readable results are in [RCA readiness](m2c-provider-error-readiness.json).

## Remaining uncertainty, recommendation and stop

**A fresh explicitly approved single-request live retest is needed to complete M2C live acceptance.** It is not needed to establish the local telemetry fixes, which are already exercised by mocks. It must not be described as testing a proven fix for the original provider rejection: that upstream cause is still unknown. If the next approved run fails, the new ledger should retain the upstream status/category/retryability for a narrower diagnosis; stop after that one request regardless of category. Do not restart, retry, switch model or activate billing to bypass it.

No live startup or generation is authorized by this RCA approval. Test-owned processes were cleaned up and ports 5188/5189 verified closed. User projects and unrelated services were not changed. Work stops here; M3 and UI redesign were not started.
