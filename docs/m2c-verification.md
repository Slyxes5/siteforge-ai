# M2C — Advanced Website Generation: verification

## Status

**M2C selesai untuk review, terverifikasi secara lokal/mock.** Tidak ada request Gemini nyata, aktivasi live, pembacaan/permintaan key, perubahan model, instalasi dependency/layanan berbayar, M3, database atau backend bisnis dalam pekerjaan ini.

M2B sebelumnya berhasil satu kali pada [live smoke PID 17204](smoke-observations/launcher-17204.json). Itu evidence historis untuk kontrak M2B, bukan bukti kualitas hasil Gemini setelah perubahan M2C. Semua angka M2C di bawah berasal dari pengujian sintetis.

Source yang sudah berisi implementasi M2C parsial dipertahankan dan dilengkapi, bukan ditimpa dengan scaffold baru. Checkpoint: `.milestones/m2b-before-m2c/` dan `.milestones/m2c-before-completion/`. Snapshot source bukan backup browser storage.

## Kemampuan baru

### Delapan komponen dalam canonical Project Schema v1

Enam blok lama tidak dihapus: Heading, Paragraph, Button, Image, Hero dan Section. Dua varian strict ditambahkan:

- **Features / Services**: section title, layout `grid` atau `list`, array item dengan title dan description. Dapat digunakan untuk fitur, layanan, menu ringkas, katalog atau proyek portfolio tanpa membuat tipe blok yang hampir sama.
- **Contact**: title, introduction/body, email, phone dan address. Nilai kosong ditampilkan sebagai belum diberikan. Ini informasi statis, **bukan form submission, email delivery, booking, pembayaran atau integrasi bisnis**.

Kedua blok tersedia di Puck, renderer dan JSON import/export. Nested item properties tetap utuh pada canonical ↔ Puck dan JSON round trips. Anchor generation dapat menunjuk Section, Features dan Contact; symbolic IDs tetap diremap menjadi ID milik aplikasi.

**Evaluasi Gallery:** gunakan komposisi Image dan Section existing dengan placeholder lokal. Dedicated gallery/grid-image block, upload, pencarian/generasi aset dan remote generated images ditunda. Jangan menyebut komposisi ini sebagai fitur upload/gallery backend baru.

### Editing candidate sebelum Save

Alur sekarang:

```text
Prompt → generated content → validation → separate candidate preview
                                         ↓
                               Edit candidate before saving (Puck)
                                         ↓
                               Apply candidate edits (memory only)
                                         ↓
                               Preview → explicit Save as new project
                                         ↓
                               Open workspace → edit/save/reload
```

Apply bukan operasi persistence. Save candidate dinonaktifkan selama sesi edit belum selesai. Input invalid tidak dapat diterapkan; user harus memperbaikinya atau membuang edit. Validasi tetap melalui adapter canonical yang sama, bukan dokumen Puck tersimpan terpisah.

Sesi edit memiliki ticket/context/candidate identity guards, serta alive guard pada editor. Workspace switch meninggalkan sesi editor lama; delayed callback tidak mengubah candidate baru atau storage. StrictMode setup/cleanup diuji. Edit manual mengikuti batas canonical editor existing; tidak diam-diam dikirim ulang ke AI atau dipaksa menjadi output generation baru.

### Prompt engineering dan relevansi

`server/generation-prompt.ts` memisahkan shared instruction **prompt version 2** dari untrusted user data. Kontrak meminta bahasa, kategori, urutan dan jumlah blok sesuai prompt, tanpa memaksakan template tetap. Permintaan tepat dua blok tidak ditambah menjadi website panjang. Jenis blok, required fields, link policy, placeholder assets dan aturan fakta dijelaskan eksplisit.

Provider masih menerima `name` dan `prompt`, tidak dokumen pengguna yang sedang terbuka. Tidak ada multi-call planner, tool calling, arbitrary code atau AI Chat Editing. Structured-output schema tetap berasal dari Zod dan diproyeksikan ke subset Gemini yang telah diaudit pada M2B.

Fixture mock untuk **coffee shop, barbershop, rental mobil, portfolio dan bisnis umum** mempunyai copy, urutan komponen dan pilihan grid/list yang berbeda. Semua berlabel mock/placeholder, bukan hasil AI nyata. Fixture membuktikan kontrak dan UI menerima variasi tersebut; **bukan** pengukuran relevansi model Gemini terhadap lima kategori.

### Grounding fakta dan fallback

Aturan prompt melarang mengarang alamat, telepon, email, harga, prestasi, sertifikasi, testimonial atau fakta bisnis yang tidak diberikan. Guard deterministik tambahan:

1. Structured Contact yang tidak kosong harus disalin dari input yang diberikan; unknown fields tetap string kosong.
2. Visible numeric/currency/email tokens, termasuk nested feature copy, harus memiliki sumber dalam input. Detected ungrounded output ditolak dengan `content_semantics / UNSUPPORTED_BUSINESS_FACT`, bukan disimpan atau diperbaiki diam-diam.
3. Guard berjalan pada backend construction dan browser receipt validation. Browser memakai **request asli**, bukan mempercayai description yang dapat dipalsukan dalam respons.
4. Diagnostic tidak membawa nilai yang ditolak, raw response atau raw validator message. Error terminal dan fallback tetap tersedia, tanpa endless loading atau automatic Save.

**Batas penting:** ini pemeriksaan konservatif atas penyalinan kontak dan token yang dapat dideteksi, bukan universal natural-language fact checker. Klaim nonnumerik, alamat yang disisipkan dalam prosa, dan pemindahan angka ke konteks klaim lain belum dapat dibuktikan benar secara otomatis. Formatting/paraphrase tertentu juga dapat ditolak. Review manusia tetap diperlukan sebelum publikasi. Edit manual atas kontak adalah input eksplisit pengguna, bukan hallucination AI.

**Fallback lokal:** pilihan **Car rental** ditambahkan, sehingga ada lima pilihan template. Rental enquiry diberi disclaimer placeholder/non-AI dan tidak mengecek ketersediaan, menerima booking atau memproses pembayaran. Empat template lama mempertahankan isi dan susunan tujuh bloknya. Fallback tetap tindakan eksplisit, bekerja tanpa provider, dan tidak auto-save.

## Perubahan arsitektur dan kompatibilitas

Tidak ada perubahan arsitektur inti atau storage format:

- Canonical tetap `schemaVersion: 1`, storage prefix existing, strict union ditambah dua varian.
- Provenance menerima `promptVersion: 1` untuk data lama dan `2` untuk generation baru.
- Renderer dan editor memakai Puck config/projection yang sama. Tidak ada arbitrary layout/code execution.
- `CandidateEditor.tsx` menambahkan isolated memory-only draft, menggunakan `VisualEditor` existing dengan label Apply khusus.
- `generation-grounding.ts` terpisah dari provider, renderer dan persistence; server dan client memakai kebijakan yang sama.
- Endpoint generation, Host/Origin/session protections, bounded response, timeout/cancellation, explicit insert/collision protection dan multi-project persistence dipertahankan.

Reader baru menerima dokumen M0–M2B tanpa migrasi/auto-rewrite. **Binary lama tidak dijamin membaca tipe Features/Contact atau provenance v2.** Ekspor/copy JSON sebelum downgrade; tidak ada silent field dropping. Tidak ada user project yang dibuka dengan browser profile asli, dihapus, diganti atau otomatis disimpan oleh pengujian.

### Budget dan batas generation

| Batas | Nilai |
| --- | --- |
| Prompt | 4000 characters |
| Generation blocks | 1–12 |
| Provider output tokens | 4096, tidak dinaikkan |
| Feature items dalam generation | 1–6 |
| Feature title | Maksimum 80 Unicode code points |
| Feature description | Maksimum 240 Unicode code points |
| Teks umum generation | Maksimum 2000 Unicode code points |
| Image generation source | `/sample-landscape.svg` saja |
| Backend response bytes | 131072, dipertahankan |

Pengelompokan layanan/proyek menjadi bounded items menghindari perluasan output tak terbatas dan blok teks panjang berulang. Batas canonical editing dapat lebih luas daripada batas AI generation; user tidak kehilangan kemampuan edit manual. Truncation/invalid schema tetap error terminal, bukan hasil sukses parsial.

## Implementasi dan masalah yang berhasil diperbaiki

- Menyambungkan guard grounding yang semula belum dipanggil ke backend dan browser boundaries; failing test membuktikan nilai kontak rekaan sebelumnya lolos construction.
- Menutup bypass forged response description: validator browser sekarang memeriksa terhadap prompt asli; RED → GREEN membuktikan forged contact ditolak.
- Memperbaiki alive guard CandidateEditor agar berfungsi dalam React StrictMode.
- Membersihkan sesi edit pada context switch dan membuktikan callback lama diabaikan.
- Memperluas schema contract regression dari enam menjadi delapan varian sambil memeriksa required/property lists enam varian lama tetap sama.
- Memperluas template uniqueness assertion mengikuti daftar template, tanpa melemahkan uji distinct copy atau tujuh blok lama.
- Memperbaiki harness Puck: publish control dicari melalui teks yang benar; array item dibuka sebelum field nested diedit; discard confirmation starter draft diterima eksplisit sebelum pindah ke proyek baru. Tidak menonaktifkan guard aplikasi untuk meluluskan test.
- Memperbarui label milestone/blok yang sudah usang tanpa mengubah susunan shell/UI.

Perubahan source utama: `src/project-schema/project.ts`, `src/editor/puck-config.tsx`, `src/editor/VisualEditor.tsx`, `src/app/CandidateEditor.tsx`, `src/app/WebsiteGenerator.tsx`, `src/app/App.tsx`, `src/ai/generation-content.ts`, `src/ai/generation-client.ts`, `src/ai/generation-grounding.ts`, `src/ai/generation-validation.ts`, `src/ai/website-generation.ts`, `server/generation-prompt.ts`, `server/gemini-provider.ts`, `server/mock-provider.ts`, `src/generator/templates.ts`, serta styles khusus blok dan tests. Daftar lengkap dan hashes ada di JSON evidence.

## Hasil verifikasi final

| Layer | Hasil |
| --- | --- |
| Typecheck | PASS |
| Production build | PASS |
| Frontend/domain/UI unit suites | **112 PASS**, 0 failed |
| Server/provider/integration/observer suites | **132 PASS**, 0 failed |
| Single-request focused suite | **20 PASS**, termasuk dalam 132 |
| Existing + M2C browser suite | **35 PASS**, tanpa retry/flaky |
| Observability/validation browser suite | **18 PASS**, tanpa retry/flaky |
| Total browser regressions | **53 PASS** |
| Client-bundle credential/backend-marker/sentinel scan | PASS |
| Existing bounded smoke runner, explicit mock mode | **1 PASS** |

Command final: `npm run typecheck`, `npm run test:e2e`, full Vitest frontend/server suites dengan JSON reporters, `npm run test:smoke`, `npm run verify:bundle`, dan `npm run smoke:observe -- --mock`.

Browser membuktikan:

- Puck mengedit layout, nested item title/description, dan seluruh Contact fields pada candidate belum tersimpan.
- Invalid item title tidak dapat diterapkan; Save tetap disabled dan storage kosong.
- Apply menghasilkan preview lokal tanpa persistence; explicit Save mempertahankan field; Open dan browser reload membaca proyek yang benar.
- Lima kategori dengan varying mock compositions mencapai preview; rental mobile tidak overflow horizontal.
- Car rental fallback bekerja saat provider disabled tanpa generation POST atau automatic Save.
- Unsupported business fact ditolak oleh real adapter/parser + synthetic transport; UI menampilkan reason aman, tanpa nilai private, candidate atau auto-save.
- Semua browser regresi M0–M2B tetap lulus: editing enam blok lama, URL safety, schema checks, Save/Reload/refresh, corrupt/conflict protection, multi-project switch/import/export, cancellation/context isolation dan fault/timeout paths.

Category E2E memakai explicit injected mock responses dari category fixture dan canonical builder. Pengujian backend/provider/integration terpisah tetap berjalan; jangan menyamakan category UI fixtures dengan real Gemini generation. Screenshot desktop edit/reload, rental mobile dan unsupported-fact error diperiksa secara visual. Puck tetap memakai scrollable canvas existing.

Fault suite menghasilkan **17 start dan 17 finish**, tepat satu finish per request. Traces/HAR tidak diaktifkan; terminal metadata di-allowlist dan diuji bebas synthetic secret values.

### Single-request safety dan dry-run

`server/smoke-startup.ts`, `server/smoke-start.ts`, `server/smoke-startup.test.ts`, `package.json` dan `package-lock.json` byte-identical terhadap checkpoint M2B. Launcher tetap `maxAttempts: 1`, synchronous non-refundable outbound budget satu, disabled secara default. Tidak ada perubahan dependency atau resource berbayar.

[Dry-run mock terbaru](smoke-observations/mock-124801b9-34aa-4780-844f-ba6db1327fc3.json): satu guarded POST, satu synthetic transport, HTTP 200, success, dua blok valid, preview tampil, storage tidak berubah dan tanpa Save. Ini memastikan dua-blok smoke harness lama tetap bekerja, bukan hasil Gemini M2C nyata.

Port **5188 dan 5189** diperiksa setelah pengujian dan keduanya tertutup. Lifecycle hanya membersihkan fixture/preview milik test; tidak menghentikan service lain. Source/build fingerprints cocok dengan dry-run terbaru.

## Evidence dan review boundary

- [Machine-readable checks, safe events, file list dan fingerprints](m2c-verification.json)
- [Saved/reopened Features dan Contact hasil edit sintetis](screenshots/m2c-edited-project.png)
- [Rental mobile candidate, mock/unsaved](screenshots/m2c-rental-mobile.png)
- [Unsupported business fact rejection](screenshots/m2c-unsupported-fact.png)
- Generated reports: `test-results/m2c-unit.json`, `test-results/m2c-server.json`, `test-results/results.json`, `test-results/observability-results.json`.

**Berhenti pada M2C untuk review.** Tidak ada izin live aktif atau request berikutnya. Kualitas bahasa, category relevance dan factual accuracy keluaran Gemini dengan kontrak M2C masih memerlukan evaluasi terpisah setelah persetujuan baru. Tidak ada M3, business backend atau deployment yang dimulai.
