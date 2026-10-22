# Stage 3B — satu smoke editing live, 21 Oktober 2026

Pengguna menyetujui aktivasi backend dan satu panggilan editing OpenRouter, kemudian memasukkan key sendiri melalui terminal lokal bertopeng. Key hanya dipindahkan ke environment proses, tidak disimpan ke file dan tidak ditampilkan dalam output. Tidak ada perubahan `.env`, konfigurasi Codex/Hermes, dependency, atau deployment.

## Hasil aktual

- Model: `nvidia/nemotron-3.5-super-vl:free`, tanpa fallback model/provider berbayar; request tetap memakai batas harga prompt/completion nol. Guardrail atau tagihan akun tidak diperiksa, sehingga laporan ini tidak mengklaim audit biaya akun.
- Proyek sintetis yang sudah ada: **SiteForge UI check**, origin `http://127.0.0.1:5178`, revision awal 1.
- Instruksi: `Ubah judul utama pada blok hero menjadi "Selamat Datang di SiteForge". Jangan ubah bagian lain.`
- UI mengirim satu permintaan setelah consent. Ledger transport: **1 panggilan, provider HTTP 200**. Tidak ada retry.
- Proposal tervalidasi dengan identitas source OpenRouter dan satu blok terdampak. Hanya teks hero berubah dari `Selamat Datang` menjadi `Selamat Datang di SiteForge`; subtitle dan CTA tetap.
- Apply masih disabled sebelum Preview. Preview menampilkan before/after yang benar tanpa mengubah draft.
- Apply mengubah draft menjadi unsaved, revision tetap 1. Save eksplisit menaikkan revision ke 2. Reload browser tetap menampilkan judul baru dan status **All changes saved**.
- Backend berhenti otomatis setelah respons; port 5188 bebas, proses backend dan terminal input sudah berakhir. Frontend 5178 tetap tersedia untuk peninjauan.

Bukti visual: [proposal dan Preview](screenshots/stage3b-live-preview.jpg), [hasil Save setelah reload](screenshots/stage3b-live-saved.jpg). Ledger lokal yang diabaikan Git: `docs/smoke-observations/edit-launcher-2924.json`, berisi PID, model, waktu mulai, jumlah panggilan, status HTTP, state transport dan status berhenti. Tidak ada prompt, respons mentah, credential, atau session header dalam ledger.

## Launcher lokal

- `scripts/start-edit-smoke.cmd`: input PowerShell `Read-Host -AsSecureString`, menjalankan backend child dengan key di environment dan membersihkan salinan key saat selesai. Tidak mengubah execution policy. Jangan jalankan ulang tanpa persetujuan baru.
- `server/edit-smoke-startup.ts`: hanya menerima `--live` dengan seluruh gate editing yang sudah ada. Generation tetap disabled. Transport memakai budget satu kali yang tidak dikembalikan jika permintaan gagal.
- `server/edit-smoke-start.ts`: bind loopback 5188, gagal bila port terpakai, ledger metadata eksklusif per PID, auto-stop setelah respons satu panggilan atau setelah 10 menit. Penghentian hanya menyentuh server miliknya sendiri.
- `server/edit-smoke-startup.test.ts`: memastikan explicit opt-in dan gate sebelum credential dibaca, generation disabled, kegagalan tetap menghabiskan budget, serta percobaan kedua tidak mencapai transport.

Jalankan helper hanya setelah memperoleh persetujuan aktivasi dan jumlah panggilan yang baru. Isi key pada terminal yang dibuka, bukan chat. Frontend memakai proxy yang sudah ada dari 5178 ke 5188. Pemilihan mode AI dan consent di UI tetap diperlukan.

## Verifikasi baru dan batasnya

**79 test lulus dalam 3 file**: `edit-smoke-startup`, `openrouter-edit-provider`, `openrouter-edit-request`. Seluruh test otomatis ini memakai transport sintetis. `npm.cmd run typecheck` dan `git diff --check` lulus. Suite lengkap, build dan E2E tidak dijalankan ulang pada langkah ini karena perubahan tambahan hanya launcher server dan input lokal.

Satu percobaan live membuktikan alur perubahan judul sederhana dalam Bahasa Indonesia, termasuk persistence. Ini belum membuktikan kualitas semua operasi add/remove/reorder, semua jenis blok, ketahanan multi-request, atau kesiapan produksi. Persetujuan satu panggilan sudah terpakai. Default aplikasi tetap offline; aktivasi berikutnya dan penggunaan kuota memerlukan persetujuan baru.
