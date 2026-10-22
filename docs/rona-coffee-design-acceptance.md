# Rona Kopi — arah kualitas generation dan komponen visual

Brief yang disetujui: contoh beranda kafe fiktif dengan identitas editorial hangat, hero bergrafis, enam kartu menu siap foto, cerita, pengalaman, galeri carousel dan kontak. Implementasi berada di SiteForge dan memakai canonical Project Schema v1; ini bukan website terpisah yang melewati engine.

## Arahan visual

- Palet turunan tema kopi: krem `#F7F0E6`, espresso `#30231D`, terracotta `#B65135`. Judul serif Georgia dan teks pendamping system sans. Tidak menambah font CDN atau dependency.
- Hero dua kolom pada desktop, bertumpuk pada ponsel; komposisi ilustrasi cangkir, bidang cahaya, tekstur halus dan garis orbital. Kartu menu memakai rasio foto yang konsisten, nama, deskripsi dan area harga kosong yang jelas.
- Kontras cerita berwarna gelap dan galeri yang bisa digeser menjaga variasi komposisi. Motion masuk hero, hover ringan dan reveal berbasis scroll memakai CSS milik host. `prefers-reduced-motion` meniadakan animasi/hover transform dan membuat navigasi carousel langsung.
- Skill [bang-motion](C:/Users/vrandly/.codex/skills/bang-motion/SKILL.md) dipakai untuk arahan visual, hierarki perhatian dan gerak yang bermakna. Brief disetujui sebelum kode. Aturan khusus video seperti autoplay/loop tanpa kontrol tidak diterapkan pada carousel website.

## Kontrak dan file implementasi

- `src/project-schema/project.ts`: field opsional hero `visual`, `imageSrc`, `imageAlt`; item menu `imageSrc`, `imageAlt`; galeri `layout=grid|carousel`. Tanpa field tersebut, dokumen lama mempertahankan bentuknya. Tidak ada migrasi atau penulisan otomatis ke localStorage. Reader aplikasi versi lama yang strict dapat menolak field baru; ekspor JSON sebelum downgrade.
- `src/project-schema/visual-assets.ts`, `public/graphics/coffee-*.svg`: tujuh ilustrasi SVG lokal milik aplikasi. Bukan foto usaha nyata atau hasil model gambar. Seluruh ilustrasi hero/menu diberi label yang jujur; item galeri memiliki alt/caption. Foto bisa diganti lewat URL yang tervalidasi di editor. Upload file gambar belum ditambahkan.
- `src/ai/website-plan.ts`, `server/website-plan-request.ts`: token style terkontrol `coffee-editorial`, `menu-cards`, `carousel`. Compiler memetakan token ke field canonical dan aset lokal; AI tidak memasukkan URL aset bebas, CSS atau script. Token lama tetap diterima. Coffee editorial dipilih hanya untuk brief kopi yang relevan, bukan seluruh kategori bisnis.
- `src/ai/generation-content.ts`: validator kandidat menerima aset lokal pada allowlist dan field visual baru. Proyeksi provider M2C lama tetap menghilangkan field visual opsional dan mempertahankan batas gambar landscape; validasi request Gemini lama tidak dilonggarkan. Harga/fakta/alt baru tetap diperiksa grounding melalui `src/ai/generation-grounding.ts`.
- `src/editor/puck-config.tsx`: field foto hero/menu dan pilihan layout galeri tersedia di Puck. Galeri carousel menjadi grid di editor agar semua item terlihat untuk diedit; preview memakai carousel interaktif.
- `src/renderer/Gallery.tsx`: scroll native dengan snap, tombol sebelumnya/berikutnya, indikator dan tombol per slide, keyboard panah/Home/End, touch scroll, tanpa autoplay. Kontrol memakai dokumen pemilik elemen agar preferensi motion benar di iframe preview.
- `src/renderer/ProjectDesign.tsx`, `project-design.css`: coffee art direction diaktifkan oleh hero coffee-editorial. Menu navigasi ringkas, tata letak berbasis container, tipografi dan palet konsisten. Metadata style baru tidak berasal dari HTML/CSS bebas model.
- `scripts/rona-coffee-scenario.ts`: request sintetis dan fixture enam blok yang sama untuk mock dan live. `src/renderer/CoffeeEditorial.test.tsx`: compiler, guards, adapter, penyimpanan dan perilaku carousel. `src/ai/generation-content.test.ts`: ekspektasi wire schema diperbaiki mengikuti sepuluh jenis blok yang sudah ada.

## Verifikasi aktual sebelum live

**160 test frontend/domain lulus dalam 14 file**, meliputi komponen baru, design, Website Plan, candidate validation/grounding, Puck adapter, schema/JSON, store/library, ResponsivePreview, WebsiteGenerator dan edit-proposal. **86 test server lulus dalam 6 file**, meliputi design generation, request/provider Website Plan serta OpenRouter request/provider/deadline. Total seleksi **246 test**.

Run frontend pertama gagal memulai worker karena timeout startup 12 worker dan tidak menjalankan test. Run diulang dengan `--maxWorkers=2`. Dua regresi kontrak M2C yang sempat muncul diperbaiki dengan proyeksi legacy; satu test lama masih mengharapkan delapan jenis blok dan disesuaikan ke sepuluh jenis yang sudah tersedia. Run final di atas lulus.

Typecheck, production build, scanner bundle dengan sentinel sintetis, Prettier dan diff check untuk file tugas lulus. Full suite dan E2E otomatis lengkap tidak dijalankan.

Browser mock pada frontend 5189 melalui backend smoke OpenRouter sintetis 5190:

- Satu generation sukses, provenance `TEST MOCK — not real AI`, schema valid, tepat hero/menu/section/features/gallery/contact.
- Mock tidak disimpan dan tidak mengganti proyek live yang sudah ada. Editor kandidat dapat dibuka, menampilkan semua komponen dan field URL foto/alt per item menu.
- Fixture visual memakai compiler, renderer dan ResponsivePreview asli, tanpa penulisan storage, diperiksa pada desktop 1280px dan mobile 390px. Hero menumpuk dan navigasi mobile tersedia; enam area gambar menu tetap ada.
- Tombol carousel pada mobile mengubah indikator dari 1/3 ke 2/3 dan menampilkan ilustrasi counter pada slide kedua. Carousel grid di editor dan reduced-motion/keyboard diperiksa melalui test otomatis.
- Screenshot mock lokal: `.browser-temp/rona-acceptance/mock-desktop.png`, `mock-mobile.png`, `mock-carousel.png`. Ledger mock menunjukkan satu transport sintetis dan server stopped true.

## Status uji live

Satu generation OpenRouter disetujui pengguna setelah implementasi dan verifikasi mock. Sesi `.browser-temp/rona-live/` dibatasi satu panggilan, timeout provider/backend/client 120000/125000/130000 ms, model `nvidia/nemotron-3.5-super-vl:free`, serta reasoning/token/biaya nol/fallback guards tetap seperti tahap sebelumnya.

Pada 22 Oktober 2026 pukul 23:43 WITA request `bbceff39-790f-4573-aeb5-32f365b995a6` **gagal pada transport provider: HTTP 502**, durasi total 561 ms. Receipt menunjukkan `provider_error`, `provider_failure`, `HTTP_ERROR`, tahap `provider_transport`, satu transport, dan schema `not_attempted`. Tidak ada kandidat live atau hasil live yang disimpan. Ledger backend PID 3264 menunjukkan `transportCalls: 1`, `providerStatus: 502`, `stopped: true`. Tidak dilakukan retry live. Bukti: [receipt kegagalan provider](screenshots/rona-live-provider-error.png).

## Referensi desain tersimpan dan reload

Setelah kegagalan live, fixture sintetis yang sama dijalankan sekali melalui sesi `.browser-temp/rona-reference/`; receipt secara eksplisit menampilkan **TEST MOCK — not real AI**. Request `7d245bb8-0dbf-4cbe-b80d-d615f9e4209c` selesai 34 ms, schema valid, satu transport sintetis. Backend PID 17108 berhenti otomatis setelah satu panggilan (`calls: 1`, `stopped: true`).

Kandidat **Rona Kopi** disimpan melalui tombol Save candidate as new project, dibuka di editor, lalu browser direload. Proyek `452b4253-0666-443b-ab9b-d5c4ac0e066c` tetap memiliki enam blok, Revision 0 dan status All changes saved; tombol Save nonaktif. Preview setelah reload mempertahankan hero editorial, enam kartu menu bergambar dan galeri carousel. Tombol Foto berikutnya mengubah indikator dari 1/3 menjadi 2/3 setelah reload.

- [Receipt mock dan Save eksplisit](screenshots/rona-mock-saved-receipt.png).
- [Preview desktop setelah reload](screenshots/rona-saved-reload-desktop.png).
- [Kartu menu siap foto setelah reload](screenshots/rona-saved-menu.png).
- [Carousel slide kedua setelah reload](screenshots/rona-saved-reload-carousel.png).

Referensi tersimpan ini adalah **hasil fixture mock untuk menilai desain dan persistensi**, bukan bukti bahwa model live telah memilih style baru. Pemilihan style oleh OpenRouter masih belum terverifikasi karena request live berakhir sebelum respons kandidat. Frontend 5189 dibiarkan berjalan untuk review; backend live dan mock satu panggilan telah berhenti otomatis. Panggilan live tambahan memerlukan persetujuan baru sesuai AGENTS.md.
