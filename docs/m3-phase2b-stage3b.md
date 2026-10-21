# M3 Phase 2B — Stage 3B: backend, client, dan panel chat

## Hasil dan cakupan

Adapter Stage 3A sekarang terhubung ke pemilihan provider backend dan mode chat HTTP. Mode awal tetap deterministic/offline. Server editing default disabled; konfigurasi provider generation tidak mengaktifkan editing. Tidak ada konfigurasi pengguna, credential, service aplikasi, atau provider live yang diaktifkan pada implementasi ini.

Panel chat dirapikan menjadi Request → Review & preview → Apply to draft → Save project. Tombol utama memiliki ukuran minimum 44px, kelompok aksi jelas, status backend, persetujuan pengiriman konten, perbandingan before/after responsif, tabel diff yang dapat digulir, serta detail teknis yang bisa dibuka. Navigasi atas membungkus pada layar sempit. Tombol Save di panel memakai mekanisme penyimpanan workspace yang sudah ada.

## Jalur dan identitas sumber

- `src/ai/edit-source.ts`: identitas publik provider/model yang diizinkan, tanpa konfigurasi atau credential.
- `server/edit-provider.ts`, `server/startup.ts`: seleksi editing yang independen dan transport injectable untuk test.
- `server/generation-server.ts`: status/result live yang eksplisit, header persetujuan live, dan refusal terklasifikasi. Host/Origin/session/loopback/admission/size/deadline guards tetap berlaku; origin lokal 5173 yang sudah ada dipertahankan.
- `src/ai/edit-contract.ts`, `src/ai/edit-client.ts`: client memilih mock atau live secara eksplisit. Perbedaan mode/model/provider pada status atau hasil ditolak; tidak ada perpindahan/fallback otomatis.
- `src/ai/structured-edit.ts`, `src/ai/edit-proposal.ts`: host mengikat source provider/model ke proposal live. Proposal mock tidak boleh mengklaim source live; proposal live wajib memiliki source valid. Metadata ini bukan output model dan tidak mengubah provenance generation website.
- `src/app/ChatEditor.tsx`, `src/app/App.tsx`, `src/styles.css`: mode AI, consent, status, tombol Save, dan layout yang lebih jelas.

Mode live hanya mengirim instruksi serta name/description/blocks dari dokumen aktif. Project ID, revision, baseline snapshot, saved records, dan provenance generation tetap lokal. Provider hanya mengembalikan operasi. Host tetap menetapkan ID, memeriksa grounding/anchor/snapshot/freshness, dan mengendalikan Preview/Apply/Save.

## Aktivasi runtime — belum dilakukan

Jalur server hanya dibuat jika seluruh syarat berikut terpenuhi:

- `SITEFORGE_EDIT_PROVIDER` dipilih sebagai `openrouter`.
- `SITEFORGE_EDIT_ALLOW_LIVE` dan `SITEFORGE_EDIT_FREE_ONLY_CONFIRMED` masing-masing tepat `true`.
- `SITEFORGE_AI_TEST_MODE` bukan `true`.
- Credential server-only disediakan melalui `SITEFORGE_EDIT_OPENROUTER_API_KEY`; nilainya tidak dicatat atau ditampilkan.
- Model tetap `nvidia/nemotron-3.5-super-vl:free`; override model lain ditolak. Timeout editing maksimal 45 detik.

Guard tersebut berbeda dari aktivasi generation. Key sendiri tidak mengaktifkan apa pun. Pembuatan provider tidak memanggil transport. Parameter nol biaya dan konfirmasi konfigurasi tidak membuktikan guardrail akun/provider aktual; perlu pemeriksaan dan persetujuan sebelum acceptance live.

Client live juga memerlukan consent eksplisit sebelum GET status maupun POST. UI menjelaskan bahwa instruction dan konten website akan dikirim ke OpenRouter dan model provider. Perubahan instruction, mode, konteks, atau draft menarik consent serta menginvalidasi pekerjaan lama. Backend mewajibkan session/Origin yang valid dan `X-SiteForge-Edit-Mode: live` sebelum provider dispatch. Header ini menyatakan intent client, bukan pengganti autentikasi atau bukti persetujuan manusia di luar UI.

Perilaku mock dan offline dipertahankan. Header preflight tambahan hanya ditawarkan pada endpoint editing dengan provider live; generation dan mock tetap menggunakan daftar header sebelumnya. Refusal dikirim sebagai error tetap HTTP 422; provider body tidak dipantulkan. HTTP timeout tetap 504. Tidak ada retry otomatis.

## Verifikasi yang dijalankan

Seleksi frontend/client/host: **275 test lulus dalam 12 file**:

```text
src/ai/edit-client.test.ts
src/ai/edit-proposal.test.ts
src/ai/structured-edit.test.ts
src/ai/edit-live.test.ts
src/app/ChatEditor.test.tsx
src/app/ChatEditor.async.test.tsx
src/app/ChatEditor.http.test.tsx
src/app/ChatEditor.workspace.test.tsx
src/app/ChatEditor.live.test.tsx
src/app/chat-workspace.test.tsx
src/app/chat-integration.test.tsx
src/app/App.test.tsx
```

Seleksi backend: **226 test lulus dalam tujuh file**: `edit-live`, `edit-provider`, `edit-server`, `edit-security`, `origin-security`, `openrouter-edit-provider`, dan `openrouter-edit-request`. Startup: **dua test lulus** di `server/start.test.ts`.

Total seleksi akhir: **503 test berbeda lulus**. Test integration memakai server loopback sementara pada port dinamis dan transport provider sintetis; tidak ada provider AI nyata yang dipanggil. Kasus workspace baru memeriksa instruksi Bahasa Indonesia, source live, consent, Preview, Apply tanpa perubahan storage, Save eksplisit, revision increment, dan reload.

TypeScript, production build, Prettier untuk file berubah, serta pemeriksaan batas credential/endpoint client bundle juga dijalankan. Scanner bundle diperluas agar mencakup nama variabel credential editing yang baru.

Test startup CLI semula gagal karena `tsx`/`os.userInfo` ditolak dalam sandbox Windows (`uv_os_get_passwd`); impor dan dua test startup lulus setelah dijalankan dengan izin di luar sandbox. Tidak ada perubahan execution policy atau dependencies.

## Batas verifikasi dan langkah berikut

- Ini verifikasi kode dan integrasi sintetis, bukan bukti model memahami instruksi Bahasa Indonesia atau kualitas AI live.
- Browser preview di port 5173 mengembalikan connection refused. Server aplikasi tidak dinyalakan untuk pemeriksaan visual; E2E/browser layout belum diverifikasi pada tahap ini.
- Full test suite, produksi, remote authentication, dan deployment tidak termasuk tahap ini.
- Sebelum live: tinjau pengiriman konten, konfirmasikan model/guardrail akun yang tersedia, siapkan credential melalui mekanisme server yang disetujui, lalu minta persetujuan untuk aktivasi/restart dan satu acceptance request berbatas.
- Uji live pertama sebaiknya mengubah satu heading, lalu memeriksa proposal, Preview, Apply, Save, dan reload secara eksplisit.

Pekerjaan lokal sebelumnya serta file anomali tetap dipertahankan. Tidak ada Git add, commit, reset, clean, push, instalasi, atau upload. Backup lokal yang direncanakan sebelumnya belum dibuat.

## Pemeriksaan UI lanjutan

Frontend kemudian dijalankan dengan persetujuan untuk pemeriksaan browser. Hasil desktop/mobile, perbaikan diff, serta alur Preview → Apply → Save → reload dicatat terpisah di [laporan pemeriksaan UI](m3-phase2b-ui-verification.md). Bagian batas browser di atas merupakan kondisi saat implementasi awal Stage 3B.

Satu smoke editing live kemudian berhasil pada 21 Oktober 2026. Lihat [bukti live, batas hasil, dan launcher satu panggilan](m3-phase2b-live-edit-smoke.md). Status belum-live pada bagian awal dokumen ini adalah riwayat implementasi, bukan status terbaru.
