# M2C Gemini HTTP 400 request contract audit

## Conclusion and scope

**No malformed current request/schema/configuration was proven to explain the live Gemini HTTP 400.** The live PID 22948 evidence proves upstream400, not its RPC status, rejected field or exact cause. No Gemini generation request, credential inspection, model change, billing activation, M3 work or redesign occurred during this audit.

Two approved improvements were implemented and verified locally:

1. A fail-closed **request contract guard before transport notification/fetch**, including input, exact application envelope/configuration, schema projection and resource bounds.
2. Optional, bounded extraction of **only an allowlisted provider RPC status enum**, propagated through backend receipt/finish telemetry, validated client, status UI and observer ledger. This makes a future separately approved failure more informative without persisting the provider body/message/details.

The normal coffee-shop request is **byte-identical before and after the guard**, verified by capturing both actual pre-change/current adapters with injected transports. This is defense-in-depth and diagnostic improvement, **not a proven fix for the historical provider rejection**.

## Historical evidence

- [PID 17204 M2B success](smoke-observations/launcher-17204.json): model gemini-3.5-flash-lite, SiteForge200, valid two-block candidate, one transport, preview/no Save.
- [PID 18104 M2C failure](smoke-observations/launcher-18104.json): SiteForge502, upstream status absent, provider_transport/HTTP_ERROR. Its missing upstream status cannot be filled from a later attempt.
- [PID 22948 M2C retest](smoke-observations/launcher-22948.json): SiteForge502, upstream400, invalid_request, non-retryable, one transport, no schema validation/preview. Its raw error body was not retained, so no exact provider RPC status, field or precondition can be recovered.

The `.milestones/m2b-before-m2c/` snapshot is a comparison baseline, not a byte-for-byte historical upstream capture. PID 17204 did not fingerprint provider/schema/system-prompt source. Its two-block scenario source does match the old recorded hash. The new pre-guard checkpoint is `.milestones/m2c-before-request-contract-audit/` (106 source/config files, no environment files, secrets, dependencies or persisted projects).

## Actual payload inspection and comparison

Both adapters were exercised only with synthetic input and injected HTTP responses. No native external fetch was used. Metrics are UTF-8 JSON byte counts, not token estimates; depth counts schema nodes with root=1.

| Item | Snapshot M2B baseline | Pre-guard/current M2C coffee |
| --- | --- | --- |
| Requested content | heading + paragraph | hero → features → contact |
| Total request body bytes | 4474 | 8834 |
| JSON Schema bytes | 3547 | 5295 |
| Schema nodes | 35 | 52 |
| Schema depth | 5 | 7 |
| Union variants | 6 | 8 |
| maxOutputTokens | 4096 | 4096 |
| System instruction | Inline safety instruction | Prompt contract v2 |
| Request/configuration field names | Same GenerateContent envelope and JSON config | Unchanged |

M2C adds nested Features items and Contact. Supported schema variants remain heading, paragraph, button, image, hero, section, features and contact. Source/current mock roundtrips verify all eight branches; no type was pruned to try to avoid a provider error.

The adapter sends the fixed official HTTPS v1beta/models/{model}:generateContent endpoint, POST, header-only credentials, redirect rejection, `systemInstruction.parts`, one `contents` user Part containing the serialized name/prompt, and `generationConfig` containing only responseMimeType, responseJsonSchema and maxOutputTokens. No tools, remote assets, Interactions envelope fields or extra generation options are sent.

## Documentation checks and ranked hypotheses

References were retrieved from public documentation/source, without an authenticated/model request:

1. [GenerateContent reference](https://ai.google.dev/api/generate-content) lists the endpoint, envelope and GenerationConfig JSON fields.
2. [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) documents supported schema features and warns that very large/deep schemas may be rejected without supplying a numeric threshold.
3. [Official Google JS SDK types](https://raw.githubusercontent.com/googleapis/js-genai/main/src/types.ts) explicitly describes responseJsonSchema as an alternative to responseSchema: omit responseSchema and require JSON MIME. It lists the supported JSON Schema subset.
4. [Model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) lists the configured stable ID and structured-output capability. This does not establish account access, quota or Free Tier availability.
5. [Official RPC code enum](https://raw.githubusercontent.com/googleapis/googleapis/master/google/rpc/code.proto) defines the diagnostic status names; no provider message is needed to validate this bounded enum.

Findings:

- **Known field/schema incompatibility:** not found in the emitted payload. All actual keywords are documented: additionalProperties, anyOf, description, enum, items, maxItems, minItems, properties, required, type.
- **Union node missing sibling type:** not a proven bug. Official examples include anyOf-only union nodes; each SiteForge branch is an object with a required, distinct singleton discriminator. No speculative type insertion was made.
- **additionalProperties:false:** supported on this JSON Schema route; it must not be confused with the OpenAPI/protobuf responseSchema representation.
- **Required/items/bounds:** no missing required target, array without items, reversed bound or overlapping block discriminator was found in the emitted schema.
- **Schema complexity:** plausible but unproven. M2C is deeper/larger, but the documentation supplies no limit proving that depth 7 / 52 nodes / 5295 bytes is rejected. An input-size/token-capacity explanation was not established either. Local validation cannot certify provider complexity acceptance.
- **Provider precondition rather than malformed payload:** remains possible. The status-only invalid_request category cannot reveal which canonical RPC code accompanied HTTP400. Historical body absence prevents choosing between these hypotheses.

The REST docs currently contain ambiguous deprecated `_responseJsonSchema`/`responseFormat` wording and a self-referential responseJsonSchema description. The field still appears in the reference and official SDK. This is insufficient evidence to migrate formats. Interactions `response_format` must not be copied into GenerateContent. No field migration, model substitution, schema rewrite or token-limit change was made on speculation.

## Proven local gap and pretransport guard

A RED test showed direct adapter calls accepted invalid input such as an empty prompt and notified/dispatched the injected transport. The HTTP backend already validates ordinary frontend input, so this is an adapter-level defense-in-depth gap, **not a reproduction of the valid coffee request's live rejection**. The fixed adapter validates before notifying `onTransportCall` or invoking fetch.

`server/gemini-request-contract.ts` now:

- Checks runtime input using the existing websiteGenerationRequestSchema.
- Requires the selected application envelope: prompt v2 system Part, one user Part containing valid request JSON, JSON MIME, responseJsonSchema and unchanged 4096 output tokens.
- Rejects extra/combined format fields such as responseSchema, _responseJsonSchema, responseFormat or tools under this deliberately narrow application contract.
- Walks **schema nodes**, not property-name strings, with a restricted application keyword/type set. This is not advertised as a full validator for every Google-supported JSON Schema feature.
- Requires the expected root blocks array and eight unique singleton discriminator variants, strict objects, complete valid required arrays, available array items, ordered nonnegative integer bounds and supported enum shapes. AnyOf-only nodes are permitted.
- Rejects non-serializable, oversized or excessively complex application payloads with fixed safe diagnostics, never raw parser errors/unknown schema keys/values.

New resource guards: body 65536 bytes, schema 32768 bytes, 256 schema nodes and schema depth 16. These are **SiteForge safety policies, not claimed Gemini API limits**. Existing frontend request limits, model output limits, timeouts and single-request limits were not changed. The valid 8834-byte payload remains unchanged and passes all guards.

Safe local rejection uses code REQUEST_CONTRACT, stage provider_request, and allowlisted INVALID_PROVIDER_REQUEST, UNSUPPORTED_REQUEST_SCHEMA or PROVIDER_REQUEST_TOO_LARGE. The failure is non-retryable, schema status remains not_attempted and transport count is zero. It is not mislabeled as a network error or invalid generated website. An existing validated website request is not silently rewritten to fit the guard.

## Optional RPC diagnostics and privacy

`server/provider-rpc-status.ts` inspects an upstream HTTP error envelope only within **4096 bytes and 150 ms**, under the existing abort signal. It requires error.code to equal the observed HTTP status and returns only a recognized error.status enum. Message, details, raw body, status text, headers and arbitrary strings are never attached to ProviderError, telemetry, UI or evidence. Parsed content exists only transiently during this bounded diagnostic operation.

Malformed, oversized, incomplete, unsupported or stalled diagnostics produce no RPC metadata; they do not replace the known HTTP error or trigger another transport. Remaining body work is cancelled, timers/listeners are removed and cancellation retains its existing behavior. The 150ms diagnostic bound is not an increase of the generation timeout.

The additive optional providerRpcStatus is revalidated at error/receipt/client/DOM-observer boundaries. Historical receipts remain readable. INVALID_ARGUMENT and FAILED_PRECONDITION are distinguished as declared provider enums, without guessing their exact message or asserting either occurred in PID22948. HTTP-based retryability is unchanged and never grants permission to retry.

## Changed files and invariants

New:
- `server/gemini-request-contract.ts` and focused regression tests.
- `server/provider-rpc-status.ts` and bounded/privacy/abort tests.

Modified:
- `server/gemini-provider.ts`: validated body construction before transport; optional bounded RPC diagnostics on HTTP failure.
- `server/provider-error.ts`: local contract failure code and safe optional RPC enum.
- Shared diagnostic schemas, `WebsiteGenerator` diagnostic text/attributes and bounded observer: additive metadata only.
- Mock fixture/client/adapter/observer tests and smoke fingerprint coverage; README and audit evidence.

Unchanged byte-for-byte from the checkpoint: canonical Project Schema, generated-content schema/projection, grounding, prompt v2, Puck config/adapters, candidate editor, generation-server scheduling/retry code, original generation limits, smoke startup/launcher/guard tests, CLI selection, fixed coffee scenario and package manifests/lockfile. No dependencies were installed or user projects migrated/overwritten.

## Validation and durable evidence

RED→GREEN covered adapter invalid-input transport prevention, missing supported-type rejection and safe RPC extraction/observer propagation. Regression matrices cover configuration conflicts, unknown fields/keywords, invalid required/enum/bounds, cyclic data, byte/node/depth budgets, safe RPC allowlist, malformed/oversized/stalled bodies, cancellation and listener cleanup.

| Final gate | Result |
| --- | --- |
| Typecheck / production build | PASS |
| Frontend/domain/UI tests | 120 PASS |
| Server/provider/integration/observer tests | 194 PASS |
| Original focused launcher tests | 20 PASS, included in server total |
| Existing/M2C browser suite | 35 PASS |
| Fault/diagnostic browser suite | 26 PASS |
| Browser regression total | 61 PASS |
| Bundle safety / injected sentinel | PASS |
| Legacy two-block production mock smoke | PASS |
| Coffee three-block production mock smoke, contacts empty, editing before Save/no persistence | PASS |

Full result files: `test-results/m2c-contract-unit.json`, `test-results/m2c-contract-server.json`, `test-results/results.json`, `test-results/observability-results.json`. The local-request rejection and RPC FAILED_PRECONDITION screenshots were visually inspected; status text is readable, no private provider message/details appears, and no candidate is rendered on failure.

- [Latest legacy mock ledger](smoke-observations/mock-47c91f92-d7c6-4cd0-8f46-422660ca7738.json)
- [Latest coffee mock ledger](smoke-observations/mock-de11fd01-94d9-4fa3-b2d8-8d8a62ac9b86.json)
- [Machine-readable results/current fingerprints](m2c-request-contract-readiness.json)

## Lowest-cost next step and stop

Do not perform another blind two-block baseline or an automatic retry. Offline checks have already been exhausted for the known request, and valid wire bytes were not changed. **No live request is authorized now.**

If the user separately chooses to continue toward real M2C acceptance, the smallest useful next experiment is exactly one coffee-shop attempt with the unchanged model/scenario, current guard and bounded RPC diagnostics, existing non-refundable one-call launcher, and no Save. It can complete acceptance if successful or supply a safer, more specific classification if rejected. A successful mock cannot guarantee either outcome.

If RPC reports INVALID_ARGUMENT, investigate the request/schema compatibility further before proposing another call; the enum alone does not identify a field. If it reports FAILED_PRECONDITION, investigate provider/account/environment availability without treating billing activation as an authorized fix. If diagnostics remain unavailable, report unknown rather than repeating. Never fall back to another model, broaden the budget or auto-enable billing.

Test-owned services were cleaned up; ports 5188/5189 are closed. The earlier live approval is spent. Audit work stops here, without M3 or redesign.
