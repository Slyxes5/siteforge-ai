# Standar kelengkapan generation — tahap awal

Tujuan: brief terbuka diarahkan menghasilkan struktur yang berguna sesuai jenis website, kemudian kandidat diperiksa sebelum Save. Struktur tersedia dan materi bisnis yang belum diisi ditampilkan terpisah. Tidak ada klaim bahwa lolos struktur berarti siap publikasi.

## Profil awal

Semua profil memeriksa hero dengan pengantar, section penjelasan usaha/profil, tombol dengan tujuan yang tersedia, dan bagian kontak.

| Profil          | Tambahan struktur                                                                        |
| --------------- | ---------------------------------------------------------------------------------------- |
| Website umum    | Kelompok informasi dengan deskripsi                                                      |
| Kafe / restoran | Menu dengan deskripsi, tempat foto dan alt per item, galeri dengan caption dan alt       |
| Katalog produk  | Daftar produk dengan deskripsi, tempat foto dan alt per item                             |
| Jasa / layanan  | Kelompok layanan dengan deskripsi                                                        |
| Portofolio      | Kelompok keahlian/layanan, galeri karya dengan caption dan alt                           |
| Rental mobil    | Dua kelompok berdeskripsi untuk armada dan informasi sewa, galeri dengan caption dan alt |

Satu item yang diminta pengguna tetap sah; tidak dipaksa menjadi enam contoh. Harga, kontak, jam buka, kendaraan, proyek klien, testimonial dan fakta bisnis lain tidak boleh dikarang untuk memenuhi standar. Contoh yang diperlukan harus diberi label sebagai contoh yang dapat diedit. Instruksi jumlah/urutan blok, pengecualian bagian, dan permintaan daftar teks tanpa foto diutamakan.

## Perilaku produk

- Form generation memiliki pilihan **Standar kelengkapan**. Default **Saran dari brief** memakai pencocokan kata lokal yang konservatif; bukan analisis AI. Brief yang tidak jelas atau mengandung beberapa kategori spesifik memakai website umum. Pilihan eksplisit pengguna mengalahkan saran ini.
- Field request opsional `completenessProfile` hanya menerima enam ID profil yang ditetapkan. Request lama tanpa field tetap valid dan tidak mendapat field tambahan otomatis. Provider diminta menyimpulkan profil dari brief jika field absen; interpretasinya dapat berbeda dari saran lokal. Pengguna dapat memilih profil secara eksplisit agar arah keduanya sama.
- Kebijakan profil dibagi oleh instruksi Website Plan (Gemini/OpenRouter) dan generation M2C legacy. Tidak ada perubahan output schema, jumlah panggilan, retry, model, credential, timeout, atau aktivasi provider.
- Kandidat menampilkan checklist **Tersedia / Belum tersedia**. Tombol anchor hanya dianggap tersedia jika target section/features/menu/gallery/contact masih ada. Untuk tautan HTTP/path yang diedit lokal, hanya bentuk tujuan yang diperiksa, bukan kesehatan endpoint atau fungsi backend.
- Kontak kosong tidak disamakan dengan hilangnya struktur kontak. Materi email/telepon, alamat/jam untuk hospitality/rental, harga kosong, dan aset placeholder ditampilkan sebagai pekerjaan isi yang terpisah.
- Checklist melekat pada profil request saat kandidat dibuat; mengubah form tidak mengganti standar kandidat sebelumnya. Edit kandidat lokal menghitung ulang checklist dari blok yang baru. Template fallback juga diperiksa dan tetap berlabel bukan AI.
- Kekurangan bersifat advisory, sehingga draf terbatas tetap bisa diedit dan di-Save secara eksplisit. Tidak ada penambahan blok/fakta otomatis, autosave, penimpaan proyek lama atau retry live. Standar tidak menambah field canonical atau migrasi localStorage.
- Compiler memakai aset kopi untuk menu-cards/carousel hanya ketika plan memilih hero coffee-editorial. Katalog atau carousel umum memakai placeholder landscape netral. Plan menu lama tetap berupa daftar teks. Field foto baru tidak ditambahkan ke proyeksi wire M2C legacy.

## File perubahan

- `src/ai/generation-standards.ts`: profil, kebijakan provider, saran lokal, dan pemeriksaan struktur/materi yang tidak memutasi proyek.
- `src/ai/website-generation.ts`: allowlist field request opsional.
- `server/website-plan-request.ts`, `server/generation-prompt.ts`: menerapkan kebijakan kelengkapan pada kedua kontrak generation.
- `src/ai/website-plan.ts`: pemilihan placeholder netral untuk menu/carousel di luar coffee editorial.
- `src/app/WebsiteGenerator.tsx`: pilihan standar, pengiriman request, pengikatan profil kandidat, pemeriksaan kandidat/template/edit lokal.
- `src/app/GenerationCompleteness.tsx`, `generation-completeness.css`: checklist dan daftar materi yang perlu dilengkapi.
- `src/ai/generation-standards.test.ts`, `src/app/GenerationCompleteness.test.tsx`, `server/generation-standards.test.ts`: cakupan baru.

## Verifikasi aktual

**104 test frontend/domain lulus pada 7 file**: generation standards, UI kelengkapan, WebsiteGenerator, Website Plan, CoffeeEditorial, generation-client, generation-content. **49 test server lulus pada 4 file**: generation standards, Website Plan request, OpenRouter request, Gemini request contract. Total **153 test terpilih**, seluruhnya memakai fixture/transport sintetis. Test baru memeriksa request enam profil, allowlist, kompatibilitas request lama, prioritas pilihan eksplisit, brief ambigu, data kosong, menu tanpa foto, target CTA hilang, galeri, rental, placeholder netral, dua blok eksplisit, nonmutasi, fallback, edit lokal dan Save eksplisit.

Satu ekspektasi test UI awal menganggap penghapusan menu menyisakan lima bagian tersedia. Hasil pemeriksaan yang benar adalah empat karena CTA hero juga kehilangan target. Ekspektasi diperbaiki beserta assertion CTA; run final lulus.

Typecheck, production build, scanner bundle dengan sentinel sintetis, formatting dan diff check lulus. Full suite dan E2E otomatis tidak dijalankan. Tidak menyalakan atau mengubah siklus hidup server aplikasi, menambah dependensi, memanggil provider live atau melakukan deployment.

Browser memakai frontend 5189 yang sudah berjalan dan harness lokal `.browser-temp/completeness-acceptance/` dengan komponen WebsiteGenerator asli. Transport generation diganti fungsi fixture sintetis, tanpa backend/provider. Pilihan Kafe/restoran menghasilkan enam blok Rona, schema valid, provenance **TEST MOCK — not real AI**, **7 dari 7** struktur tersedia dan lima pengingat materi bisnis. Kandidat uji tidak disimpan. Proyek Rona tersimpan sebelumnya tidak diganti. [Bukti UI checklist](screenshots/generation-completeness-mock.png).

## Batas tahap ini

Pemeriksaan membaca bentuk blok dan isinya, bukan pemahaman semantik penuh. Dua kelompok rental belum membuktikan akurasi isi armada/syarat; keberadaan harga/kontak bukan bukti kebenarannya. Foto dan karya asli tetap perlu ditinjau pemilik. Instruksi provider merupakan arahan, bukan jaminan model akan memenuhi semua bagian.

Checklist berada pada alur review kandidat generation, termasuk edit sebelum Save. Profil/laporan belum disimpan sebagai metadata proyek atau ditampilkan ulang pada workspace proyek tersimpan. Belum ada perbaikan otomatis, blok tambahan, upload aset, pemeriksaan SEO/aksesibilitas menyeluruh, atau gate publikasi. Jalur M2C legacy belum memiliki field foto menu pada wire sehingga kekurangan slot foto dapat tetap ditandai. Kualitas keluaran AI untuk profil ini belum diuji live.
