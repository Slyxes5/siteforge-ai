# Panduan kerja SiteForge AI

## Konteks proyek

- Stack: React 19, TypeScript, Vite, Tailwind CSS, Puck, Zod; backend Node HTTP melalui tsx.
- Penyimpanan: canonical Project Schema v1 di localStorage; draft, Apply, dan Save adalah langkah terpisah.
- M3 Phase 2B Stage 3A–3B: adapter editing OpenRouter dan wiring backend/UI tersedia; default tetap offline/disabled.
- Integrasi diuji dengan transport sintetis; satu smoke editing live pada 21 Oktober 2026 berhasil sampai Save/reload (lihat `docs/m3-phase2b-live-edit-smoke.md`). Persetujuan satu panggilan itu sudah terpakai; aktivasi dan panggilan live berikutnya memerlukan persetujuan baru.
- Baca `docs/m3-phase2b-stage3b.md` bila relevan; dokumen milestone sebelumnya adalah bukti historis.
- Engine desain generation memiliki empat preset visual terkontrol melalui `Project.design.preset` yang opsional. Baca `docs/generation-design-engine.md`; pemilihan gaya oleh AI belum diuji live.

## Peta sumber

- `src/app/`: workspace, manajemen proyek, generator, chat editing.
- `src/editor/`, `src/renderer/`: konfigurasi/adaptor Puck dan rendering.
- `src/project-schema/`, `src/persistence/`: validasi dokumen dan penyimpanan.
- `src/ai/`, `server/`: kontrak AI, client HTTP, provider, dan pengamanan backend.
- `e2e/`, `scripts/`: pengujian browser dan utilitas verifikasi.
- `docs/`: dokumentasi milestone dan bukti historis; baca hanya yang terkait tugas.

## Batas perubahan

- Implementasikan hanya cakupan yang disetujui pengguna; minta persetujuan sebelum memperluasnya.
- Periksa `git status --short` dan diff relevan sebelum mengedit. Pertahankan pekerjaan lokal dan file untracked.
- Jangan reset, clean, stash, stage, commit, atau menimpa perubahan yang bukan bagian tugas tanpa instruksi pengguna.
- Gunakan mock secara default. Permintaan provider live, penggunaan kuota, instalasi dependensi, perubahan konfigurasi Codex/Hermes, dan deployment memerlukan persetujuan eksplisit.
- Jangan membaca atau menampilkan isi `.env`, credential store, API key, token, atau header autentikasi.
- Jangan start/restart/stop server aplikasi tanpa persetujuan; jangan menghentikan proses lain untuk mengosongkan port.
- Pertahankan validasi host/schema, isolasi proyek, penolakan respons usang, serta Save eksplisit.

## Perintah Windows

- Gunakan `npm.cmd` di PowerShell jika `npm.ps1` diblokir; jangan mengubah execution policy.
- Frontend: `npm.cmd run dev -- --port 5178 --strictPort`.
- Backend generation mock: `npm.cmd run backend:mock`; ini bukan aktivasi otomatis mock chat HTTP.
- Tipe: `npm.cmd run typecheck`; unit: `npm.cmd test`.
- Unit terpisah: `npm.cmd run test:ui` atau `npm.cmd run test:server`.
- Build: `npm.cmd run build`; pemeriksaan bundle: `npm.cmd run verify:bundle` (juga membangun ulang).
- Browser: `npm.cmd run test:e2e`; fault suite: `npm.cmd run test:observability`.
- E2E membuat artefak dan menyalakan server mock/preview pada 5188/5189; memerlukan Chrome dan port kosong.

## Efisiensi dan verifikasi

- Cari dengan `rg`; baca file dan potongan yang relevan, bukan seluruh repositori.
- Kecualikan `node_modules/`, `dist/`, cache, `.browser-temp/`, `test-results/`, `.milestones/`, `docs/design-previews/`, dan `backups/` dari pencarian rutin.
- Pilih pemeriksaan sesuai perubahan; perluas hanya bila ada kegagalan atau risiko yang belum terjawab.
- Audit read-only tidak menjalankan install, test, build, atau server yang dapat menulis artefak.
- Bedakan hasil pemeriksaan yang benar-benar dijalankan dari bukti historis. Laporkan file berubah, hasil verifikasi, dan batasannya.
