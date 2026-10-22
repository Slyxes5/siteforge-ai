# Generation OpenRouter: anggaran waktu dan pengukuran respons

Perubahan 22 Oktober 2026 menindaklanjuti [uji live yang timeout pada 45 detik](openrouter-generation-live-20261022.md). Implementasi dan verifikasi pada tahap ini memakai transport sintetis; tidak ada panggilan provider live baru, aktivasi/restart/stop server aplikasi, instalasi dependency, perubahan credential atau deployment.

## Perilaku baru

| Lapisan                                                                      | Batas                                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Adapter generation OpenRouter, termasuk penerimaan body dan parsing envelope | Default dan maksimum 120000 ms                                                                          |
| Percobaan generation OpenRouter di backend                                   | Default 120000 ms                                                                                       |
| Total request generation OpenRouter di backend, termasuk validasi/compiler   | Default 125000 ms                                                                                       |
| Client dan timer luar generator UI                                           | 130000 ms                                                                                               |
| Backend generation Gemini                                                    | Tetap 45000 ms per percobaan / 90000 ms total secara default; konfigurasi router yang ada tetap berlaku |

Backend memilih anggaran OpenRouter juga untuk provider mock dengan alias telemetry OpenRouter. Karena itu launcher smoke dan startup biasa menggunakan batas yang sama tanpa konfigurasi tambahan. Override backend test yang lebih pendek tetap berlaku.

`SITEFORGE_OPENROUTER_TIMEOUT_MS` menerima integer 1..120000. Nilai eksplisit yang lama, misalnya `45000`, tetap membatasi adapter pada 45 detik; hilangkan override tersebut atau gunakan `120000` saat menyiapkan uji berikutnya. Helper sementara uji sebelumnya di `.browser-temp/openrouter-generation-20261022/start.ps1` masih memuat override 45000; helper itu belum diperbarui atau dijalankan ulang. Server yang sudah berjalan tidak otomatis mengadopsi source baru.

Model, reasoning, `max_tokens=8192`, `stream=false`, mode output, filter harga nol, penolakan fallback, validasi schema/grounding, pemisahan kandidat, pembatalan, penolakan respons usang, serta Save eksplisit dipertahankan. Perubahan ini menyediakan waktu tambahan; bukan jaminan endpoint akan selesai atau kualitas hasil tertentu. Streaming belum diimplementasikan.

## Receipt tambahan

Field opsional `providerTimings` berisi durasi kumulatif integer nonnegatif dari awal pemanggilan adapter:

- `headersMs`: header respons sudah diterima, belum membuktikan output selesai.
- `firstByteMs`: chunk body pertama yang tidak kosong diterima; byte itu belum tentu konten website atau token model pertama.
- `bodyCompleteMs`: pembacaan body selesai, belum membuktikan envelope valid.
- `responseCompleteMs`: decoding dan validasi envelope OpenRouter selesai; compiler dan grounding dijalankan sesudahnya.

Tahap yang belum dicapai tidak diisi. Receipt timeout dapat tetap membawa timing header/byte pertama tanpa timing selesai. UI menampilkan tahap yang tersedia setelah hasil akhir diterima; ini bukan progress streaming selama generation.

Metadata divalidasi dengan strict allowlist dan urutan waktu. Tidak ada raw response, reasoning, header autentikasi atau key yang disimpan oleh fitur ini. Exception observer tidak mengubah hasil provider; update yang datang setelah abort/terminal diabaikan. Receipt lama tanpa timing tetap diterima. Telemetry tidak ditambahkan ke dokumen proyek atau localStorage.

## File berubah

- Runtime: `server/openrouter-settings.ts`, `server/openrouter-provider.ts`, `server/generation-server.ts`, `src/ai/website-generation.ts`, `src/ai/generation-observation.ts`, `src/ai/generation-client.ts`, `src/app/WebsiteGenerator.tsx`.
- Test: `server/openrouter-settings.test.ts`, `server/openrouter-limits.test.ts`, `server/openrouter-deadline.test.ts` (baru), `src/ai/generation-client.test.ts`, `src/app/WebsiteGenerator.test.tsx`.
- Dokumen ini. Perubahan lokal yang sudah ada sebelum tugas dipertahankan.

## Verifikasi aktual

- **183 test backend lulus dalam 11 file**: OpenRouter deadline/settings/limits/provider/request/config/smoke-gates/smoke-startup/telemetry serta generation-server/generation-observation.
- **35 test frontend lulus dalam 2 file**: generation-client dan WebsiteGenerator. Total seleksi **218 test**.
- Simulasi waktu elapsed 110 detik membuktikan factory smoke OpenRouter sampai compiler/receipt tidak diputus batas lama 45/90 detik; tidak menunggu 110 detik nyata. Transport sintetis tetap satu panggilan dan provenance kandidat OpenRouter.
- Fake timer membuktikan adapter yang macet dihentikan pada batas 120 detik, client menunggu receipt melewati batas backend, dan UI tetap memiliki batas akhir 130 detik.
- Timing chunk/header/body/parse, timeout dengan tahap parsial, observer yang melempar exception, metadata invalid, update terlambat dan Save eksplisit diperiksa. Test regresi Gemini tetap menolak respons yang melewati anggaran per percobaannya.
- `npm.cmd run typecheck`: lulus.
- `npm.cmd run verify:bundle`: production build dan scanner bundle lulus, termasuk sentinel sintetis kedua provider.
- `git diff --check` untuk file tugas: lulus.

Full suite dan browser E2E tidak dijalankan ulang. Pengujian server menggunakan listener loopback sementara milik test. Tidak ada uji live baru pada tahap ini; keberhasilan generation real dengan anggaran baru belum terbukti dan memerlukan persetujuan panggilan baru.
