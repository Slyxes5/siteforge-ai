# Uji key Gemini baru — 22 Oktober 2026

**Uji berakhir dengan timeout lokal; validitas key baru belum dapat dipastikan.** Pengguna menyetujui satu pengajuan kafe premium, maksimal dua panggilan Gemini 3.8 → 3.5, tanpa Save. Hanya satu panggilan dikirim dan tidak diulang.

Key dimasukkan pengguna melalui PowerShell bertopeng, ditahan dalam SecureString sambil menunggu persetujuan, lalu diberikan ke environment proses launcher setelah persetujuan baru. Tidak ada pembacaan nilai key oleh agen, pembacaan `.env`, penyimpanan key ke file, atau pemindahan key dari aplikasi lain. Kesiapan diperiksa melalui sinyal boolean lokal yang tidak membawa credential.

## Hasil aktual

| Pemeriksaan                 | Hasil                                                  |
| --------------------------- | ------------------------------------------------------ |
| Launcher                    | PID 4664, loopback 5188, `--live-routed`               |
| Profil                      | `gemini-3.8-flash` → `gemini-3.5-flash-lite`           |
| Budget                      | Maksimal dua transport, satu pengajuan seumur launcher |
| Build/typecheck sebelum uji | Lulus                                                  |
| POST generation browser     | 1                                                      |
| Transport aktual            | 1, model utama                                         |
| Fallback                    | Tidak dijalankan                                       |
| HTTP SiteForge              | 504                                                    |
| HTTP/RPC provider           | Tidak tersedia                                         |
| State UI                    | `timeout`                                              |
| Waktu backend               | 30.026 ms                                              |
| Waktu observer              | 30.326 ms                                              |
| Schema kandidat             | `not_attempted`                                        |
| Preview                     | Tidak terbentuk                                        |
| Storage browser terisolasi  | Tidak berubah                                          |
| Save                        | Tidak ditekan                                          |

Observer mulai **07:59:07 WITA**, terminal **07:59:37 WITA**, 22 Oktober 2026. Timestamp UTC asli ada dalam ledger. Audit transport berakhir `network_error` setelah pembatalan; ini tidak dengan sendirinya membuktikan gangguan jaringan karena abort fetch juga masuk ke klasifikasi tersebut.

Bukti: [ledger browser](smoke-observations/launcher-4664.json), [audit transport](smoke-observations/transport-4664.json), [screenshot UI](smoke-observations/launcher-4664.png). Bukti lama tetap dipertahankan. Tidak ada perubahan source aplikasi pada tahap uji key baru ini; perubahan hanya build/test artifacts, evidence dan laporan.

## Penyebab terminal yang terbukti dan batas kesimpulan

Jalur routed smoke menetapkan `attemptTimeoutMs=30000` dan `totalTimeoutMs=60000` di `server/smoke-startup.ts`. Hasil 30.026 ms konsisten dengan deadline percobaan lokal; tidak ada status HTTP provider yang terekam sebelum fetch dibatalkan. Batas client/domain keseluruhan adalah 90.000 ms, sehingga deadline percobaan router lebih dahulu menghentikan sesi ini.

Router tidak berpindah setelah timeout yang sudah melakukan dispatch. Hanya penolakan HTTP 429/503 atau timeout sebelum dispatch yang memenuhi kebijakan fallback. Permintaan yang telah terkirim mungkin masih diproses provider; transport count tidak membuktikan penerimaan, billing atau kuota. Sisa satu slot bukan izin mengulang pengajuan: penjaga pengajuan seumur launcher sudah terpakai.

Tidak ada error `400 / INVALID_ARGUMENT` yang teramati dalam sesi key baru ini. **Hal tersebut tidak membuktikan key valid**, dan juga tidak membuktikan penyebab error sesi sebelumnya adalah key. Respons provider belum diterima, sehingga tidak ada dasar untuk menyimpulkan autentikasi berhasil/gagal, model tersedia/tidak, maupun schema diterima/ditolak.

## Langkah berikutnya

1. Audit dan sesuaikan deadline router secara offline, tetap terbatas dan selaras dengan batas domain/client. Timeout 30 detik yang dipilih untuk smoke belum terbukti sesuai bagi skenario enam blok pada model ini.
2. Lengkapi diagnostik aman per model dan klasifikasi error yang di-allowlist sebelum uji live lagi; jangan menampilkan raw error/provider body, header autentikasi atau key.
3. Verifikasi perubahan memakai transport sintetis untuk timeout setelah dispatch, abort, respons terlambat dan kegagalan fallback. Jangan melonggarkan kebijakan fallback untuk request ambigu atau menumpuk request yang masih mungkin berjalan.
4. Minta persetujuan baru sebelum sesi live berikutnya. Jangan menggunakan ulang PID/ledger ini.

Saat pemeriksaan akhir, preview observer telah berhenti (port 5189 kosong); launcher PID 4664 masih pada 5188 dan budget pengajuannya habis. Pengguna dapat menekan Ctrl+C pada PowerShell “SiteForge - Ganti Key Gemini Lokal” untuk menutup launcher dan membersihkan key dari environment sesi melalui `finally`. Menutup jendela juga mengakhiri proses lokal tersebut.
