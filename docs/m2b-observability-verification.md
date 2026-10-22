# M2B observability and timeout verification

## Approval and scope

Completed mock/disabled-only diagnosis and validation in `C:\Projects\siteforge-ai`. No real Gemini request was sent, live service was not enabled, no real API key was read/requested, and no M3 work was performed. The earlier live attempt remains inconclusive and its one-request permission remains consumed.

Source checkpoints: `.milestones/m2b-before-observability/` and `.milestones/m2b-observability-before-browser-completion/`. Source snapshots exclude credentials/environment files, dependency/build folders and browser user data. They are not backups of browser documents.

## Historical limitation

The old live attempt recorded one UI submission and the launcher later reported `transportCalls=1`; its generation HTTP result, raw provider result, schema validity and preview were not captured. **The historical reason for the 150-second observer timeout cannot be proved retrospectively from those artifacts.** The mock reproductions below establish specific failure modes, not what Gemini actually returned on that attempt. The original live report is preserved without inventing missing results.

## Reproductions and proven failure modes

1. **Abort does not itself settle an arbitrary promise.** An in-memory comparison imported the pre-observability client from the local checkpoint and the current client, injected a transport that ignores abort forever, and cancelled both. Output: legacy client `pending`; current client `cancelled`. External fetch was blocked. The current UI also has its own independently bounded generation wait, so a non-cooperative injected provider cannot retain the busy state indefinitely.
2. **Unbounded response-body observation is not a reliable UI terminal condition.** A synthetic response can deliver headers while withholding the body/end event. The browser fixture reproduces this using the real service and proxy. A body-finish wait remains pending at the observation point; the updated observer records headers immediately and independently follows the UI's terminal state. A real-browser deadline test ends visibly as `timeout` with Generate restored and no candidate/save, despite the stalled delivery.
3. **A stale success screen can be mistaken for a new result.** A new focused observer test initially failed: it returned `terminal` while `generationPosts=0`. The minimal fix requires one observed POST before accepting a terminal UI result. The same test now passes as `observer_timeout` when no new submission occurs.
4. **Cancellation and terminal telemetry require different lifecycle evidence.** Metadata generated before `res.end()` is not proof of delivery. The backend emits exactly one final event on actual HTTP `finish`/`close`, measures terminal duration there and records premature disconnect as cancelled. Late abort-ignoring provider results cannot rewrite that terminal event; their unread response body is cancelled. Retry backoff abort listeners are explicitly removed on completion/cancellation.

## Delivered behavior

### Backend lifecycle and safe instrumentation

`server/generation-server.ts` emits allowlisted `generation_start` / `generation_finish` events. Metadata includes opaque request ID, ISO start/finish timestamps, monotonic duration, outcome, schema validation category, provider-attempt count, configured transport-call count, safe HTTP/provider status codes and delivery category. It does not include prompt, raw response, environment, credential, session token or request headers. Observer callback failure cannot alter request handling.

Terminal outcomes are `success`, `provider_error`, `validation_error`, `timeout`, or `cancelled`. An error 429/500 from the injected provider is classified safely, not reflected as raw provider text. Canonical output/schema errors fail closed. Only existing bounded retry rules apply; the single-request live launcher is unchanged.

**Evidence semantics:**

- Diagnostics in a response body are a pre-transmission snapshot, not acknowledgement of client consumption.
- `delivery="finished"` means Node completed its HTTP write; it does not prove the browser parsed/rendered the response.
- `delivery="disconnected"` records the server-side HTTP disconnect; the client can independently report timeout/cancellation.
- `providerAttempts` counts provider invocations; `transportCalls` counts configured fetch invocations. Neither proves provider acceptance or billing. In mock tests these are synthetic transport calls, not real Gemini traffic.

### Frontend

`src/ai/generation-runtime.ts` races pending work against cancellation/deadline independently of transport cooperation. `generation-client.ts` bounds the complete operation, aborts stalled response reads, validates diagnostics and candidate data, and maps failures to safe outcome classes. Unknown raw exceptions are not reflected into the UI.

`WebsiteGenerator.tsx` exposes `data-generation-state` plus a small readable status receipt: request ID, timestamps, duration, validation state and known transport count. Busy controls are restored for every terminal state. A pending local ID is replaced by a validated server ID once response headers arrive; before that point backend correlation/count can remain unknown. Unknown is never presented as zero transport calls. A client that cannot parse a stalled body correctly reports schema `not_attempted`, even if the server had already validated its candidate.

Candidate preview and explicit Save remain separate. Timeout/error/cancel creates no saved document. No redesign, schema migration or business-feature extension was introduced.

### Observer and evidence capture

`e2e/generation-observer.ts`:

- submits once; never retries a click;
- captures only response status and validated request ID from headers;
- never waits on `response.finished()` or parses raw response JSON as a prerequisite to seeing terminal UI;
- independently bounds clicks, callbacks, DOM inspection and polling;
- records progress phases and always attempts a terminal evidence update;
- distinguishes application terminal state from `observer_timeout` / `observer_error`;
- refuses submission if its initial evidence writer fails;
- rejects stale success/error UI without an observed new POST.

A browser/OS freeze may still prevent a page from responding; that is reported as observer timeout rather than fabricated provider success/failure. Keep the enclosing automation deadline longer than the observer deadline and reserve cleanup time. Future live verification must use this bounded observer with a durable progress writer, not the old ad-hoc body-wait sequence. Do not start a second request when the observer fails.

## Mock browser fixture

`server/observability-fixture.ts` is a dedicated test process: it does not select providers from environment, deletes an inherited key, blocks native external fetch, and injects a synthetic Gemini transport into the real adapter/parser. The outer provider is explicitly mock. It binds loopback only and does not change the live launcher.

Fault cases: slow success, 429, 500, malformed provider JSON, unsupported block, stalled provider stream, provider deadline, cancellation, and HTTP delivery stall after valid output. Its shortened test deadlines exercise timing paths without waiting production-length wall time. The delivery-stall browser test advances only the isolated browser clock through the real 90-second UI deadline; it does not change production timeout limits.

`playwright.observability.config.ts` runs the fixture and a temporary production preview. The regular suite excludes this dedicated spec. `npm run test:e2e` runs both suites sequentially, with separate result artifacts. Both refuse to replace an occupied service. Browser contexts and storage are isolated from the user's Chrome/profile/documents.

Network tracing is disabled because Playwright traces can retain headers/session tokens/raw bodies. Evidence consists of allowlisted JSON and synthetic-only screenshots. The browser fixture blocks non-local browser resources; server native fetch is independently blocked.

## Executed quality gates

| Check                           | Verified result                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run typecheck`             | Passed                                                                                               |
| Frontend/domain tests           | 73 passed                                                                                            |
| Server/observer tests           | 111 passed                                                                                           |
| Production build                | Passed                                                                                               |
| `npm run verify:bundle`         | Passed, synthetic backend-key sentinel and checked backend-only markers absent from client artifacts |
| Existing browser suite          | 28 passed                                                                                            |
| New observability browser suite | 10 passed                                                                                            |
| Total browser scenarios         | 38 passed, parsed from both JSON reports                                                             |
| Fixture HTTP lifecycle          | 9 start events and 9 exactly-once finish events                                                      |
| Test-service cleanup            | Ports 5188 and 5189 closed after completion                                                          |

No unit/browser failure was skipped or converted into a passing result. All nine observed mock submissions reached terminal UI with one POST; success showed two validated blocks and explicit mock provenance. Error/cancel/timeout showed no candidate and left storage empty. Browser inspection verified success and timeout screenshots for visible status, restored controls and no clipping.

Focused commands:

```text
npm test
npm run test:smoke
npm run test:observability
npm run test:e2e
npm run verify:bundle
```

`test:observability` rebuilds before the dedicated browser suite. `test:e2e` rebuilds and runs existing plus observability suites. Do not run these against a live backend; all owned test processes are forced mock/disabled and test servers require free ports.

## Invariants preserved

Byte comparison against the pre-observability checkpoint confirms `server/smoke-start.ts`, `server/smoke-startup.ts`, `server/smoke-startup.test.ts`, and `package-lock.json` unchanged. The live launcher still has `maxAttempts: 1` and a lifetime single-use transport budget. No dependency was installed. No real credential was required for autonomous local validation.

## Evidence

- [Machine-readable aggregate and terminal receipts](m2b-observability-evidence.json)
- [Mock success screenshot](screenshots/m2b-observability-success.png)
- [Mock provider-error screenshot](screenshots/m2b-observability-provider-error.png)
- [Stalled-delivery timeout screenshot](screenshots/m2b-observability-timeout.png)

Primary implementation files: `src/ai/generation-observation.ts`, `generation-runtime.ts`, `generation-client.ts`, `website-generation.ts`; `src/app/WebsiteGenerator.tsx`; `server/generation-server.ts`, `gemini-provider.ts`; observer/fixture files and their unit/browser tests; Playwright config and npm test aliases. The full existing UI/editor and data-integrity browser regression suite remains green.

## Independent audit

A read-only backend audit reviewed terminal-event deduplication, deadlines across upload/provider/backoff, abort-ignoring providers, response stream disposal, safe telemetry and the unchanged single-request launcher. It reported no additional concrete gap in that scope and made no file changes. Parent-executed typecheck, full unit tests and browser suites provide the verification results above; this is not a claim that testing proves all possible failures absent.

## Readiness / next approval

The mock evidence supports a new **observable, bounded** smoke-test attempt from an engineering perspective. It does not prove Gemini account access, current quota, model availability, provider latency, factual quality or successful real generation. The previous live result remains inconclusive.

Stop here. Any new real request needs fresh explicit approval, the unchanged single-request launcher, the agreed model/synthetic prompt, no retries/model fallback, no Save, durable progress capture, and cleanup after reporting the result. Do not enable live access or start M3 as part of this task.
