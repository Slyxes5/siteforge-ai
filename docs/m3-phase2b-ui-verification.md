# Stage 3B — pemeriksaan browser dan penyempurnaan diff

Frontend lokal dijalankan dengan persetujuan di `http://127.0.0.1:5178/`. Tidak ada backend AI yang diaktifkan. Pemeriksaan memakai browser in-app, instruksi deterministic/offline, serta proyek uji terpisah bernama **SiteForge UI check**.

## Temuan dan perbaikan

Satu perubahan hero semula menampilkan ketujuh blok dalam tabel diff, termasuk blok yang tidak berubah. Kartu hasil mencapai sekitar 1.466px pada viewport desktop. Tabel kini hanya menampilkan perubahan konten/penambahan/penghapusan dan posisi yang berubah saat operasi reorder eksplisit. Daftar urutan tetap terlihat untuk proposal reorder.

Pada kasus yang sama hasilnya satu baris dan tinggi kartu sekitar 519px. Kelompok tombol Preview, Apply, Reject, dan Save dipindahkan ke dekat area permintaan, sebelum rincian proposal. Ditambahkan label aksesibilitas `Proposal actions` serta satu regression test untuk memastikan blok tidak berubah tidak memenuhi diff dan aksi berada sebelum tabel.

## Pemeriksaan browser yang dilakukan

- Membuka navigasi proyek, panel chat, referensi blok, dan pilihan mode AI/offline.
- Membuat proyek uji baru tanpa menimpa proyek lain. Browser awal belum memiliki saved project; draft contoh Studio North disimpan sebelum berpindah ke proyek uji.
- Mengubah teks hero menjadi **Selamat Datang** melalui perintah deterministic.
- Memastikan Apply disabled sebelum Preview, lalu enabled setelah Preview dibuka.
- Memastikan Apply menghasilkan **Unsaved changes** dan mengaktifkan Save.
- Menekan Save; proyek uji menjadi **Revision 1 / All changes saved**.
- Reload browser; heading tetap **Selamat Datang** dan Save kembali disabled.
- Memilih mode AI tanpa mencentang persetujuan; tombol pengiriman AI tetap disabled. Tidak ada proposal AI live yang dikirim.
- Memeriksa lebar desktop 1280px dan mobile 390px. Pada mobile document width 375px (di luar scrollbar), sehingga tidak ada overflow horizontal halaman. Kedua preview tersusun vertikal dengan lebar 317px. Tombol aksi masing-masing tinggi 44px.
- Console error tab final kosong saat diperiksa.

Percobaan awal membuka proyek baru dari draft unsaved tertahan pada tab browser. Pemeriksaan dilanjutkan di tab baru, dengan menyimpan draft awal sebelum membuka proyek uji. Tidak ada draft atau record yang dihapus.

## Bukti dan validasi kode

- [Desktop](screenshots/stage3b-chat-desktop.jpg)
- [Mobile](screenshots/stage3b-chat-mobile.jpg)
- Lima file test panel chat: **57 test lulus** (`ChatEditor`, `async`, `http`, `workspace`, `live`). Ini hasil pemeriksaan baru yang lebih terfokus; suite 503 test sebelumnya tidak dijalankan ulang seluruhnya.
- TypeScript, production build, pemeriksaan credential/endpoint bundle, Prettier, dan `git diff --check` dijalankan setelah perubahan.

Proyek uji dan contoh awal tetap tersimpan di browser pada origin 5178. Data browser ini bukan backup filesystem. Frontend dibiarkan tersedia untuk peninjauan pengguna. Guard dan persetujuan terpisah untuk aktivasi provider, penggunaan kuota, serta acceptance live tetap berlaku.
