# M2B — Validation Root-Cause Analysis & Fix

## Kesimpulan

**Bug yang dapat direproduksi sudah diperbaiki dan seluruh gate lokal/mock lulus. Penyebab spesifik kegagalan live PID 5808 belum dapat dipastikan.** Tidak ada request Gemini nyata, pembacaan/permintaan API key, aktivasi live, pergantian model, instalasi dependency, M3, atau redesign UI dalam pekerjaan ini.

Checkpoint sebelum perubahan: `.milestones/m2b-before-validation-rca/`. Canonical Project Schema v1, editor dan persistence tetap dipertahankan. Snapshot source bukan backup browser storage.

## Evidence historis dan batas kesimpulan

[Ledger live asli](smoke-observations/launcher-5808.json) tetap dipertahankan: HTTP SiteForge 502, `validation_error`, schema `invalid`, satu generation POST, satu transport call, tanpa preview/Save dan storage tidak berubah. Durasi receipt yang tersimpan adalah 3559 ms; telemetry finish yang diberikan operator mencatat 3560 ms dan delivery `finished`. Itu merupakan pengukuran pada titik lifecycle berbeda, bukan durasi provider yang dicatat secara terpisah.

Adapter lama menggabungkan JSON envelope rusak, envelope tidak cocok, teks kosong, refusal, dan output tidak valid dalam klasifikasi yang terlalu umum. Backend juga menyamakan kegagalan parsing konten, structured validation, semantik dan canonical construction. Ledger lama tidak memiliki reason/stage/issue paths, dan raw response memang tidak disimpan. Karena itu, keberhasilan fixture metadata setelah fix **tidak membuktikan** respons live lama berisi metadata tersebut. HTTP 502 adalah status SiteForge, bukan bukti HTTP Gemini 502. Transport count bukan bukti provider acceptance atau billing.

## Temuan dan perbaikan yang terbukti

| Temuan | Reproduksi sebelum fix | Perbaikan dan bukti sesudah fix |
| --- | --- | --- |
| Text Part resmi ditolak karena metadata | Part valid dengan `thoughtSignature` atau `partMetadata` menghasilkan `INVALID_OUTPUT` pada envelope | Kedua field diterima sebagai metadata opaque; hasil adapter hanya mengembalikan teks. Fixture browser dengan keduanya mencapai valid candidate preview, tanpa metadata muncul di UI/log |
| Batas Unicode tidak konsisten | Teks emoji yang diterima Zod/buildCandidate ditolak `validateGenerationCandidate` karena JavaScript `.length` menghitung UTF-16 code units | Pemeriksaan kandidat menghitung Unicode code points, selaras dengan Zod terpasang. Batas 2000 diterima, 2001 ditolak; fixture browser pada batas 2000 mencapai preview |
| Truncation salah diklasifikasi | `MAX_TOKENS` diperlakukan sebagai refusal atau envelope invalid ketika content tidak ada | Termination diperiksa sebelum full envelope: `OUTPUT_TRUNCATED`, berbeda dari `PROVIDER_REFUSAL`; output tetap ditolak tanpa retry |
| Provider JSON Schema melampaui subset terdokumentasi | Schema hasil Zod menyertakan `const`, `pattern`, `minLength`, `maxLength` | Proyeksi provider mengubah literal menjadi single-value `enum`, memakai `anyOf`, dan tidak mengandalkan keyword string yang tidak didokumentasikan. Deskripsi menyampaikan batas/format; **Zod lokal tetap memberlakukan batas, regex dan semantik secara ketat** |
| Batas model tidak selaras dengan provenance | Constructor adapter menerima ID model sintetis lebih panjang daripada maksimum 100 pada canonical provenance | Constructor menolak panjang di atas 100 sebelum transport. Ini edge case konfigurasi, **bukan penjelasan untuk model live yang digunakan**; model tetap `gemini-3.5-flash-lite` |
| Hilangnya detail penolakan | Telemetry hanya memberi kategori umum | `diagnostics.problem` opsional mempertahankan stage, reason code dan maksimal delapan issue code/path yang di-allowlist, hingga telemetry, UI dan observer |

Perubahan ke discriminated union memperjelas path field Zod tanpa mengubah enam tipe/accepted content contract. Tidak ada auto-repair JSON, default field tersembunyi, pembuangan unknown content fields, eksekusi kode, atau pelonggaran canonical schema untuk membuat respons terlihat sukses. `thought:true`, tool/code parts dan properti konten tak dikenal tetap ditolak; signature bukan thought content.

### Kontrak komponen yang diaudit

Semua property berikut wajib hadir; field teks yang boleh kosong tetap wajib dan menggunakan `""` bila tidak digunakan.

| `type` | Required properties |
| --- | --- |
| `heading` | `id`, `type`, `text` |
| `paragraph` | `id`, `type`, `text` |
| `button` | `id`, `type`, `text`, `href` |
| `image` | `id`, `type`, `text`, `alt`, `src` |
| `hero` | `id`, `type`, `text`, `subtitle`, `ctaText`, `ctaHref` |
| `section` | `id`, `type`, `text`, `body`, `tone` |

Provider schema dan local validator mempertahankan property names/required fields, enam discriminator enums, image source `/sample-landscape.svg`, section tone `light|sage|dark`, `additionalProperties:false`, dan batas 1–12 blok. Batas teks lokal tetap 2000 Unicode code points. Validasi lintas-field tetap lokal: ID unik, anchor menunjuk Section yang ada, remapping ID milik aplikasi, revision 0 dan provenance sesuai mode. Schema provider bukan pengganti semantic/canonical validation.

## Pipeline dan diagnostik aman

| Tahap | Contoh reason codes |
| --- | --- |
| HTTP/network/bounded read | `HTTP_ERROR`, `NETWORK_ERROR`, `RESPONSE_TOO_LARGE` |
| JSON envelope provider | `EMPTY_RESPONSE`, `MALFORMED_ENVELOPE_JSON`, `INVALID_PROVIDER_ENVELOPE` |
| Termination dan parts | `OUTPUT_TRUNCATED`, `PROVIDER_REFUSAL`, `PROVIDER_FINISH_REASON`, `UNSUPPORTED_PROVIDER_PART` |
| Extracted content / JSON parsing | `EMPTY_CONTENT`, `MALFORMED_CONTENT_JSON` |
| Structured content Zod | `STRUCTURED_CONTENT_REJECTED`, misalnya `invalid_type` di `blocks[0].text` |
| Semantik | `DUPLICATE_BLOCK_ID`, `UNKNOWN_SECTION_ANCHOR` |
| Canonical project | `CANONICAL_PROJECT_REJECTED`, diuji terpisah dari structured rejection |
| Browser dan UI | Response/receipt validation, canonical recheck, candidate policy, mode/provenance/context guards; preview hanya setelah valid dan Save tetap eksplisit |

Outcomes existing (`success`, `provider_error`, `validation_error`, `timeout`, `cancelled`) dipertahankan. Field `schemaValidation=invalid` pada penolakan envelope/refusal tidak berarti structured-content Zod sudah dijalankan; `problem.stage` membedakannya. Receipt timing tetap dibedakan dari finish/delivery timing dan client timing.

Diagnostic contract bersifat strict dan backward-compatible karena field baru opsional. Yang **tidak** disalin: Zod message, unrecognized key names, expected/received values, response text, thought/signature/partMetadata values, prompt, header, session token, key atau raw error cause. Unknown path segments diganti marker tetap; path/code dan jumlah issue dibatasi. Backend dan observer memvalidasi kembali metadata sebelum menulisnya. UI tetap memakai layout existing, hanya menambahkan reason/stage/field paths pada receipt.

## File yang berubah

- Adapter/classification: `server/gemini-provider.ts`, `server/provider-error.ts`, `server/generation-server.ts`.
- Content/diagnostic contract: `src/ai/generation-content.ts`, `src/ai/generation-observation.ts`, baru `src/ai/generation-validation.ts`.
- Receipt/observer: `src/app/WebsiteGenerator.tsx`, `e2e/generation-observer.ts`.
- Tests/fixtures: `src/ai/generation-content.test.ts`, baru `src/ai/generation-validation.test.ts`, `server/gemini-provider.test.ts`, `server/generation-observation.test.ts`, `server/observability-fixture.ts`, `e2e/observability.spec.ts`.
- Docs: README, banner historis `next-live-smoke-preparation.md`, laporan ini, readiness JSON, screenshot sintetis dan mock ledger baru.

Byte-identical terhadap checkpoint: `src/project-schema/project.ts`, `src/ai/generation-client.ts`, `server/smoke-startup.ts`, `server/smoke-start.ts`, `server/smoke-startup.test.ts`, `package.json`, `package-lock.json`. Tidak ada perubahan dependency atau batas single-request. File editor/persistence/M0–M2A tidak diubah.

## Pengujian dan hasil final

Bug utama melalui RED → GREEN: metadata signature/Part, Unicode candidate policy, provider-schema projection, model length guard, safe reason tracer, serta reason/path end-to-end. Assertion timing khusus mock lambat sempat diterapkan keliru pada fixture metadata baru; test diperbaiki agar mengukur delay hanya pada fixture lambat. Type errors pada cast test dan optional JSON Schema `const` diselesaikan dengan narrowing; tidak ada failure tersisa pada final run.

| Gate | Hasil |
| --- | --- |
| Typecheck | PASS |
| Production build | PASS |
| Frontend/domain unit/UI tests | 81 PASS |
| Server/provider/integration/observer tests | 129 PASS |
| Single-request focused tests | 20 PASS, subset dari 129 di atas |
| Browser existing regressions | 28 PASS |
| Browser observability/validation | 17 PASS |
| Browser total regresi + diagnostics | 45 PASS |
| Client-bundle credential/backend-marker/sentinel check | PASS |
| Fresh production mock smoke runner | 1 PASS |

Command final: `npm run typecheck`, `npm run test:e2e`, full frontend dan server Vitest suites dengan JSON reporters, `npm run test:smoke`, `npm run verify:bundle`, dan `npm run smoke:observe -- --mock`. `npm test` juga lulus pada iterasi sebelumnya; JSON reporters menguji full suites yang sama pada source final.

Browser membuktikan error terminal untuk respons kosong, truncation, refusal, malformed envelope/content JSON dan missing field; safe reason/path terlihat dan candidate tidak tampil. Metadata valid dan Unicode pada batas panjang mencapai preview. Suite lama tetap membuktikan Edit → Preview → Save → Reload/refresh, seluruh enam komponen, create/switch/import/export, conflict/corrupt-storage protection, cancel/context isolation dan mobile workflows.

Fixture telemetry menghasilkan 16 start dan 16 finish, tepat satu finish per request. Pemeriksaan allowlist dan sentinel tidak menemukan raw synthetic secrets pada metadata terminal. Trace/HAR tidak diaktifkan. Screenshot success/rejection juga diperiksa secara visual.

### Dry-run terbaru

[Mock ledger](smoke-observations/mock-11989fbd-0600-403a-9a0c-a0198fe2b145.json): satu guarded POST, satu **synthetic** transport call, HTTP 200, `success`, schema valid, dua blok, preview terlihat, storage tidak berubah dan Save tidak diklik. Durasi server receipt 20 ms, observer 171 ms. Ini bukan request/hasil Gemini nyata.

Evidence terkurasi:

- [Readiness, test totals, safe terminal events dan fingerprints](m2b-validation-readiness.json)
- [Candidate dengan metadata resmi — mock](screenshots/m2b-validation-metadataCandidate.png)
- [Missing field dengan reason/path aman](screenshots/m2b-validation-safeRejection.png)
- Generated local test reports: `test-results/validation-ui.json`, `test-results/validation-server.json`, `test-results/results.json`, `test-results/observability-results.json`.

## Kesiapan dan cleanup

**Siap secara engineering untuk satu smoke test live baru setelah izin eksplisit terpisah, bukan live success verified.** Bug yang direproduksi sudah diperbaiki, tetapi respons Gemini berikutnya dan penyebab attempt lama belum dibuktikan. Workflow startup/observer yang ada tetap digunakan; tidak perlu meminta ulang key atau mengubah model.

Test servers dibersihkan oleh lifecycle runner. Port 5188 dan 5189 diperiksa setelah final test dan keduanya tertutup. Tidak ada service lain dihentikan. Semua file fingerprints pada dry-run terbaru cocok dengan source/build saat pengumpulan evidence. Ledger live lama tidak dihapus/digunakan ulang. Pengujian nyata berikutnya tetap memerlukan readiness check lokal yang fresh dan persetujuan baru; jangan mengaktifkan live sekarang.

## Referensi resmi yang diperiksa read-only

- [REST Part: thoughtSignature, partMetadata, data union](https://ai.google.dev/api/generate-content#Part)
- [Thinking: perbedaan signatures pada generateContent dan Interactions API](https://ai.google.dev/gemini-api/docs/thinking)
- [REST GenerationConfig: supported JSON Schema subset](https://ai.google.dev/api/generate-content#GenerationConfig)
- [Structured output guidance](https://ai.google.dev/gemini-api/docs/structured-output)

Referensi publik mendukung audit kontrak, bukan bukti isi respons historis atau penerimaan request oleh akun/model tertentu. Tidak ada generation endpoint Gemini yang dipanggil untuk memeriksanya.
