# M2C live acceptance — PID 18104

## Result: provider error, acceptance not completed

One authorized run used `gemini-3.5-flash-lite`, the fixed coffee-shop scenario, the tested single-request launcher and current production preview/observer. The runner stopped with exit 1 after recording the terminal error. No retry, model change, automatic Save, source/configuration edit or M3 work occurred.

| Item | Observed result |
| --- | --- |
| SiteForge HTTP status | 502 |
| Terminal state | provider_error |
| Failure stage | provider_transport |
| Safe reason | HTTP_ERROR |
| Safe field path | Not applicable: rejection preceded content validation |
| Generation POST / guarded forwarded POST | 1 / 1 |
| Reported outbound transport calls | 1 |
| Schema validation | not_attempted |
| Block count | Unknown; no validated candidate |
| Backend receipt duration | 4954 ms |
| Observer duration | 5218 ms |
| Candidate preview | false |
| Empty-contact acceptance check | Not reached |
| Editing before Save | Not reached |
| Storage unchanged | true |
| Save clicked | false |

This is a provider HTTP failure classification, not a canonical-schema rejection or observer timeout. HTTP 502 above belongs to SiteForge. The observer ledger did not retain the provider's specific HTTP status, so no quota, credential, model-availability or billing cause is inferred. The permitted single request is consumed regardless of whether the provider accepted or billed it. Raw provider response, credential, session token and sensitive headers were not recorded here.

## Cleanup and integrity

After matching the completed launcher's PID, creation time (`2026-10-20T01:24:12.1865730+08:00`), node/script identity, loopback port ownership and mode/model, only PID 18104 was stopped. The runner cleaned up its own production preview. Both ports 5188 and 5189 were verified closed. No unrelated service was stopped. The parent PowerShell environment/key was not inspected; the supplied startup `finally` block is responsible for resetting its live flag.

All preparation source/build fingerprints still match after the test. The exclusive ledger is preserved; do not delete it to repeat a run. Another real request requires fresh explicit approval.

## Evidence

- [Safe original ledger](smoke-observations/launcher-18104.json)
- [Terminal UI screenshot](smoke-observations/launcher-18104.png), visually inspected: provider_error, schema not_attempted, transport 1, no candidate, controls restored
- [Cleanup record](smoke-observations/launcher-18104-cleanup.json)
