# Preview Desktop, Tablet, dan Mobile

Halaman **Preview** sekarang menyediakan tiga viewport: Desktop **1280 × 800**, Tablet **768 × 1024**, dan Mobile **390 × 844** piksel. Area ditampilkan dengan zoom otomatis agar muat dalam workspace. Ukuran viewport tetap sesuai pilihan; zoom hanya memengaruhi tampilan di layar.

`src/app/ResponsivePreview.tsx` merender canonical Project melalui renderer React yang sama di dalam iframe. CSS berasal dari stylesheet aplikasi yang diproses Vite, sehingga media query dan satuan `vw` mengikuti ukuran preview. Tidak ada HTML dari pengguna yang disisipkan ke `srcDoc`: shell tetap, konten dirender sebagai React. Sandbox tidak mengizinkan skrip. Anchor internal menggulir di dalam preview; navigasi tautan eksternal dinonaktifkan agar tidak mengganti halaman yang sedang diperiksa.

Pilihan perangkat tidak menulis localStorage, tidak menaikkan revision, dan tidak mengirim permintaan AI. Editor tetap mounted ketika Preview dibuka, untuk mempertahankan draft dan riwayat editor. **Back to editor** kembali ke dokumen yang sama; Save tetap eksplisit. Ini pemeriksaan layout pada ukuran layar, bukan emulator penuh browser/perangkat, touch, atau user agent.

## Verifikasi

- Seleksi unit/integrasi: **20 test lulus di 6 file** (`ResponsivePreview`, `App`, `chat-integration`, `workspace`, `multi-workspace`, `ChatEditor.workspace`). Test memeriksa draft unsaved/storage, rendering teks aman, navigasi eksternal diblokir, dan pembaruan dokumen tanpa mengganti iframe. Seleksi ini dijalankan ulang setelah perubahan desain workspace masuk bersamaan.
- TypeScript + production build, scanner bundle, dan `git diff --check` lulus.
- Browser lokal 5178 pada tampilan terbaru: ukuran font/padding desktop **64px / 48px**, tablet **38.4px / 30px**, mobile **39px / 24px 20px**. Workspace selebar 390px menunjukkan tombol 44px dan tidak ada overflow horizontal pada ketiga pilihan. Anchor internal menggulir dalam iframe tanpa mengganti URL workspace. Kembali ke editor mempertahankan proyek demo pada revision 2 dan status saved.
- Locator preview pada tiga suite E2E lama disesuaikan untuk iframe. Kasus baru `e2e/responsive-preview.spec.ts` mencakup media query, tiga ukuran, viewport workspace kecil, tidak ada API call, dan pelestarian draft/storage. Suite E2E belum dijalankan; konfigurasi menyalakan server aplikasi mock/preview dan memerlukan persetujuan sesuai AGENTS.md.

Ketika pemeriksaan browser berlangsung, desain workspace berubah bersamaan dan sempat mengimpor `./workspace.css` sebelum file itu tersedia. File kemudian tersedia; integrasi preview tetap dipertahankan, lalu build/test dan pemeriksaan browser diulang. Pekerjaan desain dari luar edit preview tidak ditimpa. Bukti visual terbaru: [Mobile](screenshots/responsive-preview-mobile.jpg) dan [workspace kecil](screenshots/responsive-preview-small-workspace.jpg).

Pemeriksaan ini tidak memanggil provider AI, menyalakan server aplikasi baru, atau menyimpan ulang data proyek browser. Frontend yang sudah berjalan pada 5178 dipakai untuk pemeriksaan. Tidak ada perubahan schema, dependency, konfigurasi Codex/Hermes, atau deployment.
