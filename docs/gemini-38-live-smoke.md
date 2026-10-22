# Uji live Gemini 3.8 → 3.5, 22 Oktober 2026

Uji terpisah berikutnya memakai key yang baru dimasukkan pengguna: [hasil PID 4664](gemini-new-key-smoke.md), satu transport dan timeout lokal 30 detik. Laporan di bawah tetap merupakan bukti historis PID 22744, bukan hasil key baru.

**Routing mencapai model cadangan, tetapi generation belum berhasil.** Persetujuan satu pengajuan dengan maksimal dua panggilan sudah terpakai. Tidak ada retry, probe, panggilan ketiga, pergantian key, atau Save setelah hasil terminal.

## Hasil aktual

Launcher PID **22744** diverifikasi observer sebagai proses `smoke-start.ts --live-routed` milik port loopback 5188. Audit sebelum pengajuan menunjukkan profil `gemini-3.8-flash` → `gemini-3.5-flash-lite`, `outboundLimit=2`, nol transport, belum berhenti dan belum memiliki ledger terpakai. Fingerprint source dibandingkan sebelum pengajuan.

| Pemeriksaan                     | Hasil                                        |
| ------------------------------- | -------------------------------------------- |
| Build dan typecheck sebelum uji | Lulus                                        |
| Skenario                        | Kafe premium Manado, tepat enam blok         |
| Pengajuan browser               | 1 POST                                       |
| Transport provider aktual       | 2, sesuai batas persetujuan                  |
| HTTP SiteForge                  | 502                                          |
| HTTP provider terakhir          | 400                                          |
| RPC provider terakhir           | `INVALID_ARGUMENT`                           |
| Status UI                       | `provider_error`                             |
| Validasi kandidat               | `not_attempted`                              |
| Preview                         | Tidak terbentuk                              |
| Storage terisolasi              | Tidak berubah                                |
| Save                            | Tidak ditekan                                |
| Browser smoke                   | Gagal sesuai penolakan provider, tanpa retry |

Observer mulai pada 22 Oktober 2026 pukul **07:50:58 WITA** dan mencapai terminal sekitar **07:51:01 WITA** (2.665 ms; durasi backend 2.470 ms). Waktu UTC asli dipertahankan dalam ledger.

Bukti asli: [ledger browser](smoke-observations/launcher-22744.json), [audit transport](smoke-observations/transport-22744.json), [screenshot terminal UI](smoke-observations/launcher-22744.png). Ledger/audit/screenshot lama tidak ditimpa. Source aplikasi tidak diubah dalam pelaksanaan uji ini; penambahan hanya bukti uji, build/test artifacts dan laporan hasil.

## Batas kesimpulan

Dua transport pada profil berurutan membuktikan model utama dicoba lalu jalur cadangan dipanggil. Router hanya mengizinkan perpindahan setelah HTTP 429/503, atau timeout sebelum dispatch; karena ada dua dispatch pada sesi ini, fallback berasal dari penolakan HTTP yang diizinkan. Namun **status awal 429 atau 503 tidak tersimpan dalam ledger/audit ini**, sehingga tidak dilaporkan sebagai observasi langsung.

Panggilan terakhir pada urutan tersebut adalah model 3.5. Error `400 / INVALID_ARGUMENT` adalah penolakan provider sebelum parsing/validasi output SiteForge, bukan bukti schema kandidat invalid. Pemeriksaan kode lokal tidak memberikan penyebab spesifik yang dapat dibuktikan. Parser error saat ini sengaja hanya mempertahankan RPC enum; message dan details provider dibuang. Karena itu, tidak ada kesimpulan bahwa key salah, schema salah, model tidak tersedia, atau kuota habis hanya dari error terakhir tersebut.

Keberhasilan mock 90 pengujian backend/router dan satu browser smoke sebelumnya tetap merupakan bukti sintetis, bukan bukti Gemini menerima kontrak request live.

## Langkah berikutnya

1. Perluas diagnostik aman secara offline agar metadata routing per percobaan dan reason code provider yang dikenali dapat dibedakan. Gunakan allowlist ketat, tanpa menampilkan raw message/details, key, header, `.env` atau body respons.
2. Uji redaksi, batas ukuran/waktu dan kasus request/key/schema dengan transport sintetis; audit proyeksi request terhadap dokumentasi resmi tanpa credential.
3. Setelah perbaikan terverifikasi dan disetujui, minta izin baru untuk panggilan live dengan budget eksplisit. Jangan memakai ulang PID/ledger yang telah menghabiskan budget.

Saat pemeriksaan akhir, preview milik observer sudah berhenti dan port 5189 kosong. Launcher live PID 22744 masih berada di 5188 dengan budget habis; tidak ada server lain dihentikan pada uji ini. Pengguna dapat menekan Ctrl+C pada PowerShell “SiteForge - Gemini 3.8 Live Lokal” untuk menutup launcher dan menjalankan `finally` yang menghapus key dari environment sesi lokal. Source laporan tidak menyimpan key.
