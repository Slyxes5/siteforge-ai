# Final live Gemini smoke test — PID 5808

## Result: failed validation, conclusively observed

This fresh approval was used for one guarded UI generation submission and one reported transport call, with `gemini-3.5-flash-lite` and the fixed synthetic two-block prompt. No retries, model changes, Save clicks, source/configuration changes or M3 work occurred.

| Field | Observed value |
| --- | --- |
| SiteForge generation HTTP status | 502 |
| Observer phase | terminal |
| UI terminal state | validation_error |
| Schema validation category | invalid |
| generationPosts / guardedPosts | 1 / 1 |
| transportCalls | 1, from validated backend diagnostics |
| Server duration | 3559 ms |
| Observer duration | 3705 ms |
| Block count | Unknown; no validated candidate |
| Candidate preview | false |
| Isolated browser storage unchanged | true |
| Save clicked | false |

The runner deliberately exited nonzero after recording the failed result. This is not another observer timeout: the UI displayed a terminal validation error, restored the Generate control, and showed no candidate. The screenshot was visually inspected.

HTTP 502 is the SiteForge backend status, not an independently recorded Gemini HTTP status. `schemaValidation=invalid` is a backend classification. The retained safe telemetry does not distinguish malformed provider JSON, rejected/truncated/refused provider output, or a canonical content-schema violation; do not invent a more specific root cause or claim which block was invalid. Raw provider content, API key, authorization headers and session token were not retained in this report.

## Cleanup

After reporting the outcome, the exact completed live launcher PID 5808 was stopped only after rechecking loopback listener ownership, process creation time, script identity, live mode and selected model. Both ports 5188 and 5189 were verified closed. The supplied PowerShell startup `finally` block handles resetting the parent live flag and clearing the free-tier acknowledgment; the parent PowerShell environment/key was not inspected. No unrelated service was stopped.

All source/build fingerprints in the original ledger still match. The actual run used the prepared bounded observer and fresh production preview. The exclusive launcher ledger is preserved; do not delete it or restart to retry under this approval.

## Evidence

- [Original safe ledger](smoke-observations/launcher-5808.json)
- [Captured terminal UI](smoke-observations/launcher-5808.png)
- [Cleanup and fingerprint checks](smoke-observations/launcher-5808-cleanup.json)

The one-request approval is consumed. A further real request requires new explicit permission. Any proposed validation-diagnostics work should use mock transport first; no fix or new request was attempted during this live test.
