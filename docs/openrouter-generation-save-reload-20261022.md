# Generation OpenRouter → Save → reload — 22 Oktober 2026

**Lulus:** satu kandidat generation live baru disimpan melalui tombol Save eksplisit, dibuka di editor, lalu tetap tersedia setelah reload browser dengan ID dan konten yang sama serta status **All changes saved**.

## Kondisi awal dan persetujuan

Setelah restart laptop, akses browser kembali tersedia. Tab lama tidak ada, server frontend/backend sudah berhenti. Frontend saja dinyalakan kembali di origin yang sama `http://127.0.0.1:5189`. UI Projects menampilkan **Saved projects (0)** dan generator kosong. Kandidat dari uji live sebelumnya tidak tersedia untuk Save; ini bukan kegagalan reload terhadap proyek yang telah disimpan.

Pengguna kemudian secara eksplisit memilih **Generate ulang sekali lewat OpenRouter, lalu Save dan reload**. Helper sesi baru berada di `.browser-temp/openrouter-generation-20261022-save/`, memakai salinan launcher single-use dan timeout 120000 ms. Pengguna memasukkan key di terminal lokal bertopeng. Agent tidak membaca nilainya atau menyimpannya ke file. Frontend PID 7340, backend PID 20284, terminal input PID 8756.

Preflight melalui proxy 5189 menunjukkan mode live dan model `nvidia/nemotron-3.5-super-vl:free`, ledger transport nol sebelum satu klik Generate. Model, reasoning default, `max_tokens=8192`, output `prompt-json`, `stream=false`, filter harga prompt/completion nol dan penolakan fallback tetap dipertahankan. Akun/tagihan tidak diaudit.

## Generation aktual

Nama: **SiteForge OpenRouter Save Check**. Prompt sintetis sama dengan uji ulang sebelumnya: tepat hero → features → contact, judul kedai, dua item features, kontak kosong dan arahan visual terracotta. Design direction tetap otomatis.

| Bukti receipt                   | Hasil                                  |
| ------------------------------- | -------------------------------------- |
| Request backend                 | `c133d750-76c0-484f-9399-7f626d01aaa4` |
| Mulai WITA                      | 22 Oktober 2026, 23:10:45.391          |
| Selesai WITA                    | 22 Oktober 2026, 23:11:41.051          |
| Outcome / schema                | `success` / `valid`                    |
| Durasi                          | 55659 ms                               |
| Transport calls / provider HTTP | 1 / 200                                |
| Headers / first body byte       | 2133 / 2406 ms                         |
| Body complete / response parsed | 55591 / 55592 ms                       |
| Candidate / project ID          | `99c05ed4-4f47-469a-8eaf-62353f65971b` |
| Pilihan desain AI               | Ember studio                           |
| Struktur                        | 3 blok, hero → features → contact      |

Kandidat menampilkan headline `Kedai Kopi Uji SiteForge`, subtitle `Konten placeholder sintetis untuk uji SiteForge; bukan data bisnis nyata.`, dua item `Menu kopi` dan `Kunjungan` dengan teks placeholder, serta contact `Informasi kontak belum diberikan.` tanpa detail kontak rekaan.

Respons selesai setelah batas lama 45 detik, sehingga percobaan ini menunjukkan kegunaan praktis batas baru untuk satu generation real. Ini tidak menentukan penyebab timeout pertama maupun menjamin latensi pada request lain.

## Save dan reload aktual

1. Sebelum Save, UI menampilkan `Not saved` dan `Validated candidate only. Nothing has been saved or replaced.`
2. Tombol **Save candidate as new project** diklik satu kali. UI mengonfirmasi `Candidate saved as a new project. The open project was not changed.`, `Saved as a new project`, dan `Tersimpan secara lokal`; tombol Save kandidat menjadi disabled.
3. **Open candidate in editor** dipilih. Aplikasi sempat melaporkan dialog konfirmasi meninggalkan draf awal Studio North. Saat diperiksa ulang, tidak ada dialog aktif dan proyek baru sudah terbuka; agent tidak mengulang klik atau mengeluarkan perintah accept dialog. Editor menunjukkan ID proyek yang sama, revision 0, tiga blok dan **All changes saved**.
4. Browser direload pada `http://127.0.0.1:5189/?project=99c05ed4-4f47-469a-8eaf-62353f65971b`. Nama, ID, revision 0, tiga blok dan **All changes saved** tetap terlihat; Save project disabled.
5. Preview dibuka setelah reload. Accessibility tree menampilkan judul, subtitle, kedua item features, CTA menuju blok contact dan teks contact yang sama. Screenshot menunjukkan desain hangat/serif Ember studio tetap dirender.

Revision 0 adalah revision awal kandidat yang disimpan sebagai proyek baru; tidak ada edit tambahan yang menaikkan revision. Verifikasi melalui UI dan reload, tanpa membaca atau menulis localStorage lewat skrip.

## Bukti dan akhir sesi

- [Screenshot proyek setelah Save dan reload](screenshots/openrouter-save-reload-20261022.png).
- Ledger lokal: `.browser-temp/openrouter-generation-20261022-save/ledger-20284.json` — transport satu, HTTP200, stopped true, timeout provider/backend/client 120000/125000/130000 ms.
- Source fingerprint launcher: `93cc5b89af951ed8ede839974c2abf4a63d0f008e31555b599b337c6397ad061`, sama dengan source tahap implementasi yang dipakai uji sebelumnya.
- Backend PID 20284 dan terminal input PID 8756 sudah berakhir; port 5190 tertutup saat diperiksa. Frontend PID 7340 di 5189 dan tab proyek tersimpan dipertahankan untuk review.

Tidak ada retry atau generation tambahan. Tidak ada perubahan source aplikasi, install, build, test suite otomatis baru atau deployment pada sesi ini. Tambahan repository hanya laporan dan screenshot bukti; helper/process log/ledger berada di folder sementara yang diabaikan Git. Uji ini membuktikan Save/reload untuk satu proyek generation OpenRouter; ekspor/impor, edit berikutnya, serta restart laptop setelah Save belum diuji dalam sesi ini.
