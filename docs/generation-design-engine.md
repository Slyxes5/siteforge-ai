# Engine desain generation — tahap pertama

Tahap ini menambah variasi desain website yang dihasilkan, bukan desain aplikasi studio. AI Website Plan dapat memilih arah visual terstruktur dari prompt. Pengguna juga dapat memilih arah eksplisit sebelum generation; pilihan pengguna diprioritaskan oleh host.

| Preset           | Warna dan tipografi                          | Komposisi                                                  |
| ---------------- | -------------------------------------------- | ---------------------------------------------------------- |
| Sage editorial   | Hijau natural, headline serif                | Editorial kiri, ruang lapang, garis pemisah                |
| Ocean modern     | Biru, headline sans serif tebal              | Hero dua kolom pada area lebar, bertumpuk pada area sempit |
| Ember studio     | Terracotta hangat, headline serif            | Hero terpusat, ruang lapang                                |
| Midnight product | Surface gelap, aksen biru terang, sans serif | Hero terpusat, spacing lebih ringkas                       |

## Alur dan kontrak

`Website prompt + designPreference opsional → provider Website Plan → design enum → compiler → Project.design.preset → renderer/editor/preview`.

- `src/project-schema/design.ts`: empat ID preset dan metadata desain strict. Schema v1 mendapat field opsional `design: { preset }`. Tidak ada perubahan atau penulisan otomatis dokumen lama; mereka tetap memakai gaya lama. Versi aplikasi lama yang memakai strict schema dapat menolak field baru—simpan JSON sebelum downgrade.
- `src/ai/website-generation.ts`: input `designPreference` opsional dengan enum yang sama. Default request lama tetap hanya name/prompt.
- `src/ai/website-plan.ts`: proyeksi schema provider baru mewajibkan top-level `design` berupa salah satu preset atau `default`. Parser lokal tetap menerima plan lama tanpa design. `default` atau field absen tidak menambahkan metadata jika tidak ada pilihan pengguna.
- `server/website-plan-request.ts`: prompt mengarahkan pilihan visual sesuai kebutuhan/mood, hierarki hero, konten berguna dan next step, tanpa kategori/template wajib, heading berulang atau gambar placeholder yang tidak perlu. Instruksi eksplisit jumlah/urutan blok dan grounding fakta tetap diprioritaskan.
- `src/ai/generation-content.ts`: pilihan eksplisit diterapkan host, termasuk untuk jalur generation M2C lama. Receipt validation menolak kandidat yang tidak mempertahankan pilihan pengguna. Plan berisi design yang tidak dikenal ditolak; tidak ada silent fallback untuk design yang invalid.
- `src/renderer/ProjectDesign.tsx`, `project-design.css`: pilihan hanya memetakan ke CSS milik host. AI tidak dapat memasukkan CSS, HTML, font URL, script atau image URL melalui field design. Container query mengatur hero split berdasarkan area dokumen, termasuk di canvas editor. Typography, tone section, CTA, feature cards dan spacing memakai token yang konsisten.
- Renderer dan VisualEditor memakai pembungkus desain yang sama. Metadata dipertahankan oleh adapter Puck, chat edit, persistence, copy/export/import. Chat editing saat ini mempertahankan desain; belum ada operasi chat untuk mengganti preset.
- `WebsiteGenerator`: pilihan **Design direction**, label desain pada kandidat, dan dukungan pilihan eksplisit pada local template fallback. Mode otomatis di fallback lokal tetap gaya template awal, tidak mengaku menganalisis prompt sebagai AI. Pergantian pilihan berlaku pada kandidat berikutnya; Save tetap eksplisit.

Versi prompt/content provenance generation yang lama tetap dipertahankan; kapabilitas visual ditandai oleh metadata preset tersendiri. Provider live, fallback, budget transport, credential, dan aktivasi server tidak diubah.

## Verifikasi yang dijalankan

Seleksi frontend **117 test lulus, 17 file**, meliputi generation plan/content/client, desain, UI generator, candidate isolation, adapter, schema dan persistence. Seleksi backend **161 test lulus, 9 file**, meliputi HTTP generation desain, server generation, kontrak/provider Gemini, Website Plan, OpenRouter request/provider dan konfigurasi. Total **278 test berbeda**; seluruh inferensi memakai transport/fixture sintetis. Test HTTP memakai server test loopback sementara; tidak ada provider eksternal dipanggil.

Kasus baru memeriksa empat pilihan AI, prioritas pilihan pengguna, penolakan mismatch di receipt/UI, invalid design tanpa fallback, kompatibilitas plan/dokumen lama, safe text, pelestarian melalui Puck/chat edit/storage/JSON, Save eksplisit dan template lokal tanpa panggilan AI. TypeScript, production build, Prettier untuk perubahan engine, diff check dan scanner bundle juga lulus. Full suite dan E2E otomatis tidak dijalankan ulang.

Browser pada frontend 5178 yang sudah berjalan:

- Kandidat template lokal Ocean modern menunjukkan background biru dan grid hero dua kolom. Kandidat uji tidak disimpan sebagai proyek.
- Empat fixture visual dengan konten yang sama dirender melalui compiler dan renderer asli. Midnight memiliki surface `rgb(16,24,39)` dan teks `rgb(237,243,255)`; Ember memiliki hero terpusat dan warna hangat; Sage memakai hero editorial transparan dengan garis pemisah.
- Ocean pada viewport workspace 390px memiliki lebar halaman/scroll masing-masing 375px (scrollbar desktop mengambil sisa lebar), tidak ada overflow horizontal. Hero berubah menjadi satu kolom dan feature cards bertumpuk.
- Kontrol browser tersendat saat mencoba mengganti kandidat demo melalui Discard; penggantian itu tidak dinyatakan terverifikasi. Pemeriksaan visual lanjutan memakai halaman fixture mandiri. Ini bukan bukti penyebab masalah dialog/browser atau bahwa bug aplikasi tertentu sudah diperbaiki.

## Contoh yang dapat diperiksa

Setelah build, jalankan `node --import tsx scripts/render-design-previews.tsx` untuk menghasilkan ulang HTML mandiri di `docs/design-previews/`. Skrip memakai fixture sintetis, tidak membaca environment/credential/browser storage dan tidak memanggil AI. HTML membawa CSS hasil build sehingga bisa dibuka sendiri; tidak membutuhkan model, CDN font, atau deployment.

Contoh: [Sage](design-previews/sage-editorial.html), [Ocean](design-previews/ocean-modern.html), [Ember](design-previews/ember-studio.html), [Midnight](design-previews/midnight-product.html). Bukti gambar: [Ocean desktop](screenshots/design-ocean-modern.jpg), [Ocean mobile](screenshots/design-ocean-mobile.jpg), [Midnight](screenshots/design-midnight-product.jpg), [Ember](screenshots/design-ember-studio.jpg), [Sage](screenshots/design-sage-editorial.jpg).

## Batas tahap ini

Ini fondasi visual terkontrol, belum generator desain bebas. Belum ada warna/font kustom, variasi layout seluruh jenis section, nested layout, upload/generation gambar, atau penilaian estetika otomatis. Pilihan preset oleh model dan kualitas beberapa prompt berbeda belum diuji live. Backend generation legacy yang tidak mengirim design tetap memakai gaya lama pada mode otomatis. Aset gambar placeholder tetap jujur sebagai placeholder.

Generasi visual oleh model dan pemilihan asset nyata masih perlu evaluasi dengan brief tetap. Aktivasi server dan permintaan live memerlukan persetujuan baru sesuai AGENTS.md. Tidak ada penggunaan kuota AI baru, instalasi, deployment, perubahan konfigurasi Codex/Hermes, atau operasi Git destruktif pada tahap ini.

## Tahap komposisi hospitality

Tahap berikutnya menambah susunan konten yang dapat dipakai untuk café, restoran, dan usaha hospitality:

- Navigasi halaman dibentuk dari judul bagian yang tersedia, dengan menu ringkas pada layar ponsel.
- Hero dapat ditemani gambar lokal pada layar lebar dan bertumpuk pada layar sempit.
- Blok menu menampilkan nama, deskripsi, dan harga opsional. Harga kosong jika tidak diberikan.
- Blok galeri berisi gambar, teks alternatif, dan caption. Generation hanya boleh memakai placeholder lokal `/sample-landscape.svg`; pemilik menggantinya melalui editor.
- Bagian kontak menerima jam operasional opsional. Informasi kontak dan jam tidak ditampilkan bila kosong.
- Tautan hero dan tombol boleh menuju bagian menu, galeri, dan kontak yang benar-benar ada.

Schema canonical tetap versi 1 dan field baru bersifat opsional atau additive agar dokumen lama tetap valid. Renderer, editor Puck, Website Plan, generation legacy, mock provider, serta structured editing mengenal blok menu/galeri. Kualitas provider live dan pemilihan gambar nyata belum diuji; pengujian itu memerlukan persetujuan baru sebagaimana batasan pada AGENTS.md.

Pemeriksaan tipe dijalankan setelah perubahan tahap ini dan lulus. Unit test, build, browser QA, dan panggilan provider live tidak dijalankan pada tahap ini.
