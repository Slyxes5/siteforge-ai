# Uji generation OpenRouter — 22 Oktober 2026

Hasil: satu panggilan live berakhir **timeout**, tanpa kandidat dan tanpa Save. Persetujuan untuk satu panggilan telah digunakan; tidak ada retry atau fallback.

## Skenario dan isolasi

- Pengguna meminta uji live generate website melalui OpenRouter dan menyetujui start halaman uji 5189 serta backend 5190. Backend Gemini yang sudah berjalan di 5188 tidak diubah atau dihentikan.
- Pengguna memasukkan key melalui terminal lokal bertopeng. Key hanya diteruskan melalui environment proses backend; nilainya tidak dibaca oleh agent, dicetak, atau disimpan ke file.
- Model tetap `nvidia/nemotron-3.5-super-vl:free`, output `prompt-json`, timeout 45000 ms, `maxAttempts=1`, budget transport lifetime satu. Request adapter tetap menggunakan batas harga prompt/completion nol dan `allow_fallbacks=false`; akun/tagihan tidak diaudit.
- Nama kandidat: `SiteForge OpenRouter Live — Kedai Kopi`. Prompt memakai skenario sintetis dari `scripts/coffee-acceptance-scenario.ts`, ditambah arahan `Choose a warm terracotta visual design suitable for a coffee shop.`
- Struktur diminta: hero, features, contact; kontak kosong dan tanpa fakta bisnis nyata. Design direction tetap `AI chooses from my prompt`.
- Launcher dan konfigurasi proxy sementara berada di `.browser-temp/openrouter-generation-20261022/` (diabaikan Git); source aplikasi tidak diubah untuk uji ini.

## Hasil aktual

| Bukti | Hasil |
| --- | --- |
| Request backend | `b1ec9913-9eb6-4c8e-83e1-a150838695a8` |
| Mulai (WITA) | 22 Oktober 2026, 08:07:46.852 |
| Selesai (WITA) | 22 Oktober 2026, 08:08:31.871 |
| Receipt UI | `timeout`, durasi 45020 ms |
| Transport calls | 1 |
| Provider HTTP | 200 |
| Schema validation | `not_attempted` |
| Preview kandidat / Save | Tidak tercapai / tidak diklik |
| Pesan UI | `Generation timed out. No candidate was saved.` |

Header HTTP 200 tidak membuktikan generation berhasil. Batas waktu habis sebelum adapter menyelesaikan penerimaan/parsing respons dan menghasilkan output untuk compiler. Bukti ini tidak menentukan apakah penyebabnya antrean, reasoning model, transmisi body, atau kondisi provider lain. Pemilihan preset AI belum dapat dinilai.

Ledger metadata: `.browser-temp/openrouter-generation-20261022/ledger-26520.json`. Screenshot receipt yang diperiksa secara visual: `.browser-temp/openrouter-generation-20261022/timeout.png`. Tidak ada raw response, header autentikasi, session token, atau credential dalam bukti tersebut.

Backend uji PID 26520 berhenti otomatis setelah respons timeout. Port 5190 dan terminal input sudah berakhir saat diperiksa; frontend uji PID 5136 di 5189 dipertahankan untuk melihat hasil. Backend awal PID 4664 tetap berada di 5188.

## Verifikasi yang dijalankan

- 78 test sintetis lulus dalam empat file: `openrouter-smoke-gates`, `openrouter-smoke-startup`, `openrouter-request`, dan `openrouter-provider`.
- Parser PowerShell launcher dan konfigurasi proxy terisolasi diperiksa sebelum start.
- Status melalui proxy 5189 diverifikasi live dengan model OpenRouter dan ledger budget nol sebelum klik Generate.
- UI diverifikasi setelah satu klik Generate dan menunjukkan timeout serta transport satu.
- Tidak menjalankan install, build, full suite, E2E penuh, perubahan model/batas waktu, deployment, atau percobaan live tambahan.
