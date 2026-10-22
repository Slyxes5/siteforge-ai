# Uji ulang generation OpenRouter — 22 Oktober 2026

**Berhasil:** satu panggilan live menghasilkan kandidat website tervalidasi dalam 19440 ms. Kandidat tetap belum disimpan. Tidak ada retry, fallback, perubahan model atau pengurangan reasoning/token.

## Persetujuan dan sesi baru

Pengguna meminta restart dan uji coba baru setelah implementasi [anggaran waktu OpenRouter](openrouter-generation-timeout.md). Saat pemeriksaan, proses sebelumnya sudah berhenti dan tidak ada listener di 5188/5189/5190; tidak ada proses lain yang dihentikan. Frontend baru PID 31392 dijalankan di 5189 dengan proxy ke backend uji OpenRouter 5190. Backend PID 27320 dijalankan setelah pengguna memasukkan key di terminal lokal bertopeng. Nilai key tidak dibaca oleh agent, dicetak atau disimpan ke file.

Helper baru berada di `.browser-temp/openrouter-generation-20261022-retest/`. Helper lama dan bukti timeout pertama dipertahankan. Helper baru secara eksplisit memakai timeout provider 120000 ms; backend memiliki anggaran 125000 ms dan client/UI 130000 ms. Launcher memakai factory smoke yang membatasi satu transport lifetime, maxAttempts satu dan tanpa retry otomatis.

Preflight melalui proxy memastikan mode live dengan model `nvidia/nemotron-3.5-super-vl:free` dan ledger transport nol sebelum klik Generate. Fingerprint source yang tercatat sebelum request dan cocok setelah request: `93cc5b89af951ed8ede839974c2abf4a63d0f008e31555b599b337c6397ad061`.

## Input dan hasil

Nama dan prompt sama dengan [percobaan sebelumnya](openrouter-generation-live-20261022.md): `SiteForge OpenRouter Live — Kedai Kopi`, skenario kedai sintetis tiga blok dari `scripts/coffee-acceptance-scenario.ts`, ditambah arahan `Choose a warm terracotta visual design suitable for a coffee shop.` Design direction tetap `AI chooses from my prompt`.

| Bukti                           | Hasil                                                   |
| ------------------------------- | ------------------------------------------------------- |
| Request backend                 | `870964f9-984c-47ae-bcce-2757c53c258c`                  |
| Mulai (WITA)                    | 22 Oktober 2026, 12:40:29.021                           |
| Selesai (WITA)                  | 22 Oktober 2026, 12:40:48.462                           |
| Outcome / schema                | `success` / `valid`                                     |
| Durasi receipt                  | 19440 ms                                                |
| Transport calls / provider HTTP | 1 / 200                                                 |
| Provider headers                | 2313 ms                                                 |
| First body byte                 | 2450 ms                                                 |
| Body complete                   | 19415 ms                                                |
| Response envelope parsed        | 19415 ms                                                |
| Candidate ID                    | `e4c236f0-8031-4d3d-a47f-a44103193c19`                  |
| Preset pilihan AI               | `ember-studio` — Ember studio                           |
| Struktur                        | hero → features → contact                               |
| Save                            | Tidak diklik; UI menampilkan Not saved / Belum disimpan |

Preview diperiksa melalui accessibility tree dan screenshot. Headline sesuai `Kedai Kopi Uji SiteForge`; subtitle menandai konten sintetis. Features berisi dua item `Menu kopi` dan `Kunjungan` dengan instruksi placeholder. Contact menampilkan `Informasi kontak belum diberikan.` tanpa detail kontak rekaan. Hero terpusat dengan tipografi serif, warna hangat dan CTA menuju blok kontak. Struktur expanded menunjukkan tepat tiga blok sesuai urutan.

Model, output mode `prompt-json`, `stream=false`, `max_tokens=8192`, reasoning default, filter harga nol dan penolakan fallback dipertahankan. Akun/tagihan provider tidak diaudit. Kandidat tidak diedit atau disimpan; persistence Save/reload bukan bagian yang terverifikasi pada percobaan ini.

## Bukti dan cleanup

- [Receipt, struktur dan hero](screenshots/openrouter-generation-retest-20261022.png).
- [Features, contact dan kontrol Save yang belum diklik](screenshots/openrouter-generation-retest-sections-20261022.png).
- Ledger metadata lokal: `.browser-temp/openrouter-generation-20261022-retest/ledger-27320.json`; transport satu, provider HTTP200, stopped true, timeout baru serta fingerprint source.
- Backend berhenti otomatis setelah respons; PID 27320 dan terminal input PID 23932 sudah tidak ada, port 5190 tertutup saat diperiksa.
- Frontend PID 31392 di 5189 dipertahankan dan tab kandidat tetap terbuka untuk review. Tidak ada listener 5188 pada pemeriksaan awal maupun akhir.

Tidak ada perubahan source aplikasi, install, build, suite test otomatis baru atau deployment pada turn uji live ini. Verifikasi 218 test, typecheck dan bundle pada tahap implementasi adalah bukti historis yang tercatat di dokumen anggaran waktu.

## Batas kesimpulan

Hasil ini membuktikan satu generation real berhasil melalui adapter, compiler, validasi dan preview, termasuk pemilihan preset oleh AI. Durasi 19,44 detik berada di bawah batas lama 45 detik; karena itu hasil ini **tidak membuktikan bahwa kenaikan timeout sendirian menyelesaikan penyebab percobaan pertama**. Variasi antrean/provider/reasoning belum dapat dipisahkan, dan kualitas untuk prompt website yang lebih kompleks belum diuji. Metadata first byte bukan pengukuran token konten pertama.

Persetujuan panggilan baru ini sudah terpakai. Tidak ada generation tambahan setelah hasil berhasil.
