# M2C live acceptance retest — PID 22948

## Result: provider HTTP 400; acceptance not completed

Exactly one newly authorized coffee-shop attempt used `gemini-3.5-flash-lite`, the latest tested single-request launcher and production observer. Readiness fingerprints matched before submission; the live loopback launcher identity and unused PID ledger were verified. Runner exit: 1. No retry, model change, code/configuration change, auto-save, billing activation or M3 work occurred.

| Item | Observed result |
| --- | --- |
| SiteForge HTTP | 502 |
| providerStatus (upstream HTTP) | 400 |
| providerErrorCategory | invalid_request |
| providerRetryable | false |
| Terminal state | provider_error |
| Stage / reason | provider_transport / HTTP_ERROR |
| Generation POST / forwarded POST / transport calls | 1 / 1 / 1 |
| Backend receipt duration | 1220 ms |
| Observer duration | 1485 ms |
| Canonical/content schema validation | not_attempted |
| Validated block count | Unknown; no validated candidate |
| Candidate preview | Not displayed |
| Empty contacts / editing before Save | Not reached |
| Storage unchanged / Save clicked | true / false |

The new telemetry preserved the actual upstream HTTP status through the UI and ledger. `invalid_request` is the safe status-based classification, not proof of a particular malformed field/schema or another precise provider precondition. The upstream response body was not captured; no more specific cause is inferred. This new result does not retrospectively establish the missing upstream status for PID 18104.

## Cleanup and evidence

Only the completed node smoke launcher PID 22948 was stopped, after rechecking its creation time (`2026-10-20T02:20:09.6873230+08:00`), script identity, loopback ownership and mode/model. The runner removed its own production preview. Ports 5188 and 5189 were verified closed. Unrelated services were not stopped. Parent PowerShell environment and credential values were not inspected.

All RCA readiness source/build fingerprints still match after the attempt. No credential, session token, sensitive header or raw provider response was included in this report. No saved project was created or changed. The original per-PID ledger is preserved.

- [Original safe ledger](smoke-observations/launcher-22948.json)
- [Terminal screenshot](smoke-observations/launcher-22948.png), visually inspected
- [Cleanup record](smoke-observations/launcher-22948-cleanup.json)

The one-request approval is consumed. Work stops after this attempt; any further diagnosis/change or real generation requires its appropriate separate scope/approval. No additional generation was attempted.
