# M2C RPC-diagnostic live retest — PID 8896

## Result: provider HTTP 400 / INVALID_ARGUMENT

One newly authorized coffee-shop attempt used `gemini-3.5-flash-lite`, the unchanged fixed payload, latest pretransport guard, bounded RPC diagnostics, single-request launcher and production observer. All readiness fingerprints matched before submission. The runner exited 1 after persisting the terminal error. No retry, model/payload/code change, auto-save, billing activation or M3 work occurred.

| Item | Observed result |
| --- | --- |
| SiteForge HTTP | 502 |
| providerStatus | 400 |
| providerRpcStatus | INVALID_ARGUMENT |
| providerErrorCategory | invalid_request |
| providerRetryable | false |
| Terminal state | provider_error |
| Stage / reason | provider_transport / HTTP_ERROR |
| Generation POST / forwarded POST / outbound transport calls | 1 / 1 / 1 |
| Backend receipt duration | 1164 ms |
| Observer duration | 1332 ms |
| Output/canonical schema validation | not_attempted |
| Validated block count | Unknown; no validated candidate |
| Candidate preview | Not displayed |
| Empty contacts / editing before Save | Not reached |
| Storage unchanged / Save clicked | true / false |

The local request guard passed before the one transport. The provider declared INVALID_ARGUMENT, but that enum alone does not identify a particular rejected field, schema constraint or exact underlying cause. No raw provider error message/details/body, credential or sensitive header was persisted. This new RPC observation does not establish missing codes/statuses for earlier attempts.

## Cleanup and integrity

Only completed smoke launcher PID 8896 was stopped after matching creation time (`2026-10-20T03:07:03.5127280+08:00`), node/script identity, loopback ownership, live mode and fixed model. The runner cleaned up its own production preview. Ports 5188 and 5189 were verified closed; unrelated services were not stopped. Parent-shell environment and credentials were not inspected.

All source/build fingerprints still match the accepted request-contract readiness record after the test. No project was saved or overwritten. The original per-PID ledger remains preserved and the one-request approval is consumed. No additional generation or diagnosis was attempted after this outcome.

- [Original safe ledger](smoke-observations/launcher-8896.json)
- [Terminal UI screenshot](smoke-observations/launcher-8896.png), visually inspected
- [Cleanup record](smoke-observations/launcher-8896-cleanup.json)

Work stops after this attempt. Another real request needs separate explicit approval.
