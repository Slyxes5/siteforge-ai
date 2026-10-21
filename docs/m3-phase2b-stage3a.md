# M3 Phase 2B — Stage 3A: adapter editing OpenRouter, offline

## Cakupan

Tahap pertama menambahkan kontrak prompt khusus editing dan adapter OpenRouter yang belum dihubungkan ke startup, route HTTP, environment, atau UI. Transport wajib diinjeksi; tidak ada fallback ke fetch global. Seluruh pengujian menggunakan respons buatan dan credential sintetis.

File baru:

- `server/openrouter-edit-request.ts`: prompt operasi edit, validasi input, dan request builder murni.
- `server/openrouter-edit-provider.ts`: transport terbatas, decoding envelope, dan pemeriksaan operasi/target.
- `server/openrouter-edit-request.test.ts`, `server/openrouter-edit-provider.test.ts`: pengujian offline.
- Dokumen ini.

## Kontrak dan batas

Input hanya instruction dan context (name, optional description, blocks). Project ID, revision, generation provenance, snapshot, serta metadata proposal ditolak. Block ID tetap diperlukan untuk menunjuk target. Konten website diperlakukan sebagai data dalam satu pesan user JSON, terpisah dari system prompt.

Output berupa JSON operasi version 1: update, add, remove, reorder. Bahasa instruksi, termasuk Bahasa Indonesia, dijelaskan dalam prompt; kemampuan model memahami bahasa belum diverifikasi secara live. Penolakan eksplisit `{ "refusal": true }` tidak menghasilkan proposal. Markdown, tool calls, metadata palsu, target tidak dikenal, serta tipe/URL yang tidak valid ditolak.

| Batas            | Kebijakan                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Model request    | Tepat `nvidia/nemotron-3.5-super-vl:free`, mengikuti kebijakan model proyek                                 |
| Model respons    | Hanya ID tersebut atau nama sama tanpa suffix `:free`, mengikuti kompatibilitas adapter generation yang ada |
| Request          | Maksimum 32.768 byte UTF-8, termasuk prompt dan schema; tanpa pemotongan otomatis                           |
| Completion       | `max_completion_tokens: 4096`                                                                               |
| Envelope respons | Maksimum 131.072 byte, berdasarkan declared maupun streamed size                                            |
| Timeout          | Maksimum 45 detik untuk transport, pembacaan, dan decoding; dapat diperketat                                |
| Percobaan        | Satu pemanggilan transport per proposal; tanpa retry atau fallback adapter                                  |
| Routing          | Satu model tetap, `allow_fallbacks: false`, `max_price` prompt/completion nol                               |
| HTTP             | Endpoint tetap, redirect error, credentials omit, cache no-store                                            |

Byte limit input bukan pengukuran tokenizer model. Batas completion dan kecukupan konteks masih perlu acceptance terpisah. Model/account/quota readiness serta biaya aktual tidak dibuktikan oleh test offline atau parameter request. Cost nonzero yang dilaporkan dalam envelope ditolak; metadata usage dapat tidak disediakan provider.

Pembacaan menggunakan UTF-8 fatal decoding. Timeout/cancel membatasi penantian walaupun fetch atau pembatalan body tidak kooperatif; respons terlambat dibuang. Error tidak memuat credential, instruksi, atau raw provider body. Tidak ada logging konten.

## Otoritas host dan batas aktivasi

Adapter hanya mengembalikan operasi; tidak membuat project/proposal ID, mengubah draft, menjalankan operasi, atau menyimpan data. Pemeriksaan target memakai detached scratch state. Host tetap bertanggung jawab atas grounding fakta/URL, anchor, snapshot, revision, freshness, Preview, Apply, dan Save.

Adapter ini bukan `BackendEditProvider` sintetis Stage 1. Backend saat ini tetap hanya menerima provider sintetis, sedangkan status/result HTTP dan mode proposal host masih mengharuskan `mock`. Jangan memasang adapter live ke jalur tersebut dan melabelinya mock.

## Verifikasi yang dijalankan

Perintah memakai runtime/dependencies yang sudah tersedia, tanpa instalasi atau server:

```text
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run --config vitest.server.config.ts server/openrouter-edit-request.test.ts server/openrouter-edit-provider.test.ts
node node_modules/vitest/vitest.mjs run src/ai/structured-edit.test.ts src/ai/edit-proposal.test.ts
```

- TypeScript: lulus.
- Dua file test baru: 77 lulus.
- Dua file regresi host yang sudah ada: 133 lulus.
- Total kasus berbeda dalam seleksi akhir: 210 lulus.
- Kasus mencakup proyeksi data, bahasa/data injection, limit byte, model override, HTTP failure, refusal, truncation, malformed UTF-8/envelope, invalid targets/URLs, host-owned IDs, grounding, cancel, stalled body, dan late response.
- Prettier diperiksa untuk keempat file TypeScript baru dan dokumen ini.
- Build, full suite, E2E, koneksi OpenRouter, serta kualitas model live belum diuji pada tahap ini.

## Tahap berikutnya, memerlukan persetujuan

1. Rancang capability/status/result serta sumber proposal yang membedakan mock dan live secara jujur tanpa mengubah provenance generation website.
2. Tambahkan wiring startup server dengan otorisasi live khusus editing, konfirmasi guardrail akun, credential server-only, dan injeksi transport eksplisit. Tetap disabled secara default.
3. Tambahkan mode UI, persetujuan pengiriman instruction/konten website, dan error/refusal yang jelas. Pertahankan perlindungan lifecycle serta Save eksplisit.
4. Verifikasi integrasi dengan transport sintetis sebelum persetujuan terpisah untuk service restart dan satu acceptance live berbatas.

Perubahan lokal sebelumnya, termasuk origin 5173, test origin, dokumentasi, `.npmrc`, `AGENTS.md`, dan file anomali dipertahankan. Tidak ada staging, commit, instalasi, deployment, atau perubahan konfigurasi global.

## Referensi protokol

- [OpenRouter chat completions](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion): endpoint, messages, max_completion_tokens, dan bentuk respons.
- [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection): allow_fallbacks dan max_price. Parameter ini tidak menggantikan persetujuan penggunaan akun/kuota.
