# Gemini 3.8 utama, 3.5 cadangan

Hasil terbaru: [uji key baru PID 4664](gemini-new-key-smoke.md) mengirim satu transport dan berakhir pada deadline lokal 30 detik, tanpa fallback/preview/Save. Validitas key belum dapat disimpulkan; jangan mengulang uji tanpa persetujuan baru.

Urutan yang dipilih pengguna pada 22 Oktober 2026: `gemini-3.8-flash` → `gemini-3.5-flash-lite`. Implementasi memakai router SiteForge yang sudah ada. Tidak ada penemuan model melalui API, pergantian key, atau penyalinan konfigurasi/kredensial Void Cut.

**Pembaruan:** [uji live PID 22744](gemini-38-live-smoke.md) sudah dilakukan setelah persetujuan baru maksimal dua panggilan. Fallback terpicu, tetapi generation berakhir dengan provider HTTP 400 / INVALID_ARGUMENT; preview tidak terbentuk dan Save tidak ditekan. Persetujuan tersebut telah terpakai. Instruksi persiapan di bawah tidak mengizinkan pengulangan uji.

## Perilaku

- Default router saat opt-in memakai urutan tersebut; override model eksplisit tetap dihormati. Aktivasi backend tetap membutuhkan flag live, daftar model terverifikasi dan konfirmasi Free Tier yang sudah berlaku. Tidak ada environment atau konfigurasi aplikasi yang diaktifkan oleh perubahan source ini.
- Fallback setelah penolakan HTTP 429/503; maksimal dua transport, tanpa mengulang model yang sama. Timeout sebelum dispatch mengikuti kebijakan router yang sudah ada; timeout/network ambigu setelah dispatch, error 400/401/403/500, cancellation dan output invalid tidak memicu fallback.
- Launcher lama `--live`/`--mock` tetap satu transport. Jalur baru harus dipilih dengan `--live-routed`/`--mock-routed`. Seluruh jatah hanya berlaku bagi satu pengajuan Generate sepanjang umur launcher; keberhasilan model utama tidak menyisakan slot untuk pengajuan berikutnya.
- Jalur `--live-routed` memerlukan persetujuan baru maksimal dua panggilan dan gate `SITEFORGE_SMOKE_ROUTING_CONFIRMED=true`, di samping persyaratan live lama. Pemilihan urutan model bukan persetujuan menjalankan panggilan tersebut.
- Mode mock memakai credential sintetis dan transport fixture, berlabel mock, serta sengaja membuat primary 503 agar fallback dapat diuji. Fixture kafe memblokir native fetch. Browser memakai storage terisolasi dan tidak menekan Save.
- Model yang benar-benar berhasil disimpan dalam provenance kandidat dan diagnostik routing backend. Ledger browser mencatat profil, batas transport, jumlah panggilan, validasi, screenshot dan perubahan storage; tidak menyimpan respons mentah atau key.

## Verifikasi

Perintah lokal tanpa request provider:

```text
npm.cmd run typecheck
npm.cmd run test:server -- server/routed-smoke.test.ts server/smoke-startup.test.ts server/smoke-runner.test.ts server/model-router.test.ts server/model-router-safety.test.ts server/routed-generation-provider.test.ts server/model-router-config.test.ts
npm.cmd run smoke:observe -- --mock-routed --scenario=premium-cafe
node scripts/check-client-bundle.mjs
```

Uji browser membutuhkan port 5188/5189 kosong dan menjalankan server mock/preview sementara. Jangan menghentikan server lain untuk mengosongkan port.

Hasil aktual pada 22 Oktober 2026:

- Typecheck dan production build: lulus.
- Tujuh file pengujian backend/router: **90 pengujian lulus**, termasuk provenance model aktual, penolakan fallback pada error 400/autentikasi/output invalid, budget seumur proses, gate live terpisah dan CLI mock yang memblokir transport eksternal.
- Browser kafe premium: **1 lulus**, satu POST, dua transport sintetis (primary 503 lalu cadangan 200), schema valid, enam blok, preview tampil, storage tidak berubah dan Save tidak ditekan.
- Pemeriksaan bundle client: lulus; tidak menemukan pola kredensial, variabel key backend, endpoint Gemini/OpenRouter atau sentinel yang diperiksa. Ini pemindaian artefak client yang baru dibangun.
- Launcher uji lama PID 20864 dihentikan setelah persetujuan pengguna, tanpa menghentikan proses lain. Server mock/preview dimiliki dan dibersihkan runner; port 5188/5189 kembali kosong.
- Tidak ada panggilan Gemini live baru, instalasi, deployment atau perubahan konfigurasi Codex/Hermes.

Bukti browser: [ledger mock](smoke-observations/mock-98269759-2492-4e50-9a60-874d26f54bd3.json) dan [screenshot](smoke-observations/mock-98269759-2492-4e50-9a60-874d26f54bd3.png). Screenshot diperiksa secara visual; konten tetap berlabel TEST MOCK dan menggunakan placeholder gambar lokal. Bukti mock tidak membuktikan penerimaan request oleh Gemini live.

## Uji live berikutnya — belum diizinkan

Setelah persetujuan baru untuk menyalakan launcher baru dan maksimal dua panggilan, gunakan input key bertopeng di PowerShell lokal. Jangan masukkan key ke chat atau source, jangan membaca `.env`, dan jangan memindahkan key dari aplikasi lain.

Launcher menggunakan profil tetap di source sehingga tidak mewarisi pilihan model lama. Dalam sesi lokal yang memegang key, setelah gate provider/Free Tier/izin live diatur secara eksplisit, jalankan `node --import tsx server/smoke-start.ts --live-routed`; sertakan gate `SITEFORGE_SMOKE_ROUTING_CONFIRMED=true`. Jangan menjalankan instruksi ini selama persiapan offline.

Observer harus memakai PID launcher baru, tidak memakai PID/ledger yang sudah terpakai:

```text
npm.cmd run smoke:observe -- --live-routed-approved --pid=<PID-baru> --scenario=premium-cafe
```

Hasil uji Gemini lama PID 20864 tetap dipertahankan di `docs/smoke-observations/launcher-20864.json`: satu transport, provider HTTP 400 / INVALID_ARGUMENT, tanpa preview, tanpa Save, storage tidak berubah. Urutan model baru belum membuktikan penyebab error tersebut teratasi; tidak ada retry atas request lama.

Referensi model resmi yang diperiksa read-only: [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite). Dokumentasi kapabilitas bukan bukti akses, kuota atau billing proyek pengguna.
