# Gemini credentials — safe local setup (Phase 1)

## Current approval boundary

Phase 1 permits implementation and mock-only verification. **It does not authorize a live Gemini smoke test or any quota-consuming request.** Do not set `SITEFORGE_AI_ALLOW_LIVE=true`, click through a live-enabled provider, or run a provider-health generation probe without a new explicit approval.

The backend must default to disabled. The test bootstrap `npm run backend:mock` explicitly selects the mock provider, disables live access and clears any inherited SiteForge Gemini key before starting. Mock candidates are labeled TEST MOCK and retain mock provenance when saved. They are not real AI output.

## Credentials belong only to the backend process

Use a dedicated SiteForge Gemini Developer API project/key. Do not reuse credentials from Hermes, Cheat Clip Pro or another project. Confirm the account/project's free-tier eligibility and current quotas in AI Studio; do not attach billing or enable paid features for this milestone. Free-tier terms may permit review/product-improvement use of prompts; do not submit confidential client data.

Never put keys in:

- React source, JSON project documents, imports/exports or browser localStorage;
- `VITE_*` variables, Vite config, URLs/query strings, frontend build commands;
- screenshots, logs, chat messages, issue reports or committed files.

There is no credential-entry form in the frontend. This implementation uses backend process environment variables; it does not automatically load a `.env` file. No actual key is included in the project.

## Optional preparation in a separate PowerShell window

The following is for the user to run locally, **not a request to send a key in chat**. It prepares a backend process with live generation still disabled. The key is entered through a masked prompt and is not included in command history.

```powershell
Set-Location 'C:\Projects\siteforge-ai'
$secret = Read-Host 'Dedicated SiteForge Gemini API key' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:SITEFORGE_GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable secret, pointer
}
$env:SITEFORGE_GEMINI_MODEL = 'gemini-3.5-flash-lite'
$env:SITEFORGE_AI_PROVIDER = 'gemini'
$env:SITEFORGE_AI_ALLOW_LIVE = 'false'
npm run backend
```

A masked prompt does not encrypt process environment memory. Keep this window private. Do not print environment variables or enable verbose HTTP/request-body logging. The same key must not be copied into the terminal that builds/runs frontend code.

After stopping the backend with Ctrl+C, remove the key from that shell:

```powershell
Remove-Item Env:SITEFORGE_GEMINI_API_KEY -ErrorAction SilentlyContinue
```

Closing that shell also discards its process-scoped environment. Do not use system-wide `setx` or put a key into repository setup scripts.

## Key already prepared / single-request smoke launcher

Do not re-enter or display an existing key. The dedicated launcher is now available with a single-use transport budget and no automatic retries. Follow [single-request-smoke.md](single-request-smoke.md) for safe disabled/mock commands from the existing PowerShell session and cleanup. The normal backend's default attempt limit is not suitable for a one-request live test. **Live activation still requires separate explicit approval.**

## Mock-only development

In a separate terminal inside the project:

```text
npm run backend:mock
```

Use the frontend on `http://127.0.0.1:5178`. The backend uses loopback port 5188; the dev/preview proxy exposes only `/api`. Existing services on occupied ports must not be stopped automatically. Mock mode is intended for testing and must not be presented as a working Gemini connection.

## What remains unverified

Even after preparing a key, Phase 1 does not establish account entitlement, model availability, free-tier status, quota, provider quality or actual Gemini latency. Those require separately approved checks. A loaded credential or successful local status response is not evidence of successful provider generation.

No code in this milestone enables billing. Setting a local live switch would not itself prove requests are free; provider-side account settings remain authoritative. Do not change that switch until approval for the live smoke test is given.
