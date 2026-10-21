@echo off
setlocal
cd /d "%~dp0.."
title SiteForge - Input Key Lokal
powershell.exe -NoLogo -NoProfile -Command "$secret = Read-Host 'Masukkan API key OpenRouter (input bertopeng, tidak disimpan)' -AsSecureString; $ptr = [IntPtr]::Zero; try { $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret); $env:SITEFORGE_EDIT_OPENROUTER_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr); [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $ptr = [IntPtr]::Zero; $secret.Dispose(); $env:SITEFORGE_EDIT_PROVIDER = 'openrouter'; $env:SITEFORGE_EDIT_ALLOW_LIVE = 'true'; $env:SITEFORGE_EDIT_FREE_ONLY_CONFIRMED = 'true'; $env:SITEFORGE_EDIT_MODEL = 'nvidia/nemotron-3.5-super-vl:free'; $env:SITEFORGE_AI_TEST_MODE = 'false'; & node --import tsx server/edit-smoke-start.ts --live } finally { if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }; Remove-Item Env:SITEFORGE_EDIT_OPENROUTER_API_KEY -ErrorAction SilentlyContinue; $secret.Dispose() }"
endlocal
