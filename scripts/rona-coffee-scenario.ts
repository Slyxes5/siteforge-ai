/** Synthetic design acceptance brief, not a real business. No contact or price claims. */
export const ronaRequest = {
  name: "Rona Kopi",
  prompt:
    "Buat beranda premium berbahasa Indonesia untuk konsep kafe fiktif Rona Kopi. Gaya editorial hangat: krem, espresso, terracotta, serif ekspresif; pilih ember-studio. Buat tepat enam blok dalam urutan hero, menu bergambar, cerita, pengalaman, galeri carousel, kontak. Hero gunakan style coffee-editorial; judul persis 'Kopi hangat, ruang untuk jeda', subtitle singkat yang mengundang dan CTA 'Jelajahi menu' menuju blok menu. Menu gunakan features style menu-cards, judul 'Pilihan untuk setiap suasana', tepat enam item konsep: Espresso, Cappuccino, Kopi Susu Rona, Matcha Latte, Croissant, Roti Kayu Manis. Deskripsikan sebagai inspirasi menu, bukan klaim ketersediaan; harga kosong. Cerita gunakan section tone dark: judul 'Ruang kecil, cerita panjang', isi dua kalimat hangat tentang konsep ruang untuk menikmati jeda. Pengalaman gunakan features grid dengan tiga gagasan: Menikmati jeda, Berbagi cerita, Menemukan inspirasi. Galeri gunakan image style carousel dengan tepat tiga item, caption 'Sudut untuk singgah', 'Di balik secangkir', 'Detail yang hangat'; description menjelaskan bahwa ilustrasi bisa diganti foto asli. Kontak judul 'Sampai jumpa di Rona', ajakan melengkapi detail kontak; email, phone, address dan openingHours kosong. Semua visual berupa ilustrasi lokal yang bisa diganti, bukan foto usaha nyata. Jangan tambah angka, statistik, testimoni, sertifikat, harga, jam buka atau kontak rekaan. Hasil harus lengkap, berguna, enak dibaca di ponsel dan desktop, tanpa heading atau CTA berulang yang tidak perlu.",
} as const;
const block = (
  type: string,
  text: string,
  extra: Record<string, unknown> = {},
) => ({
  type,
  text,
  body: "",
  action: "",
  target: "",
  style: "",
  items: [],
  email: "",
  phone: "",
  address: "",
  openingHours: "",
  ...extra,
});
export const ronaPlan = {
  design: "ember-studio",
  blocks: [
    block("hero", "Kopi hangat, ruang untuk jeda", {
      style: "coffee-editorial",
      body: "Pelankan langkah. Temukan inspirasi rasa dan ruang untuk cerita yang belum selesai.",
      action: "Jelajahi menu",
      target: "1",
    }),
    block("features", "Pilihan untuk setiap suasana", {
      style: "menu-cards",
      items: [
        {
          title: "Espresso",
          description:
            "Inspirasi rasa kopi yang pekat, untuk jeda singkat yang berarti.",
          price: "",
        },
        {
          title: "Cappuccino",
          description: "Konsep perpaduan kopi dan kelembutan busa susu.",
          price: "",
        },
        {
          title: "Kopi Susu Rona",
          description:
            "Inspirasi kopi susu untuk menemani obrolan yang mengalir.",
          price: "",
        },
        {
          title: "Matcha Latte",
          description: "Konsep rasa lembut dengan sentuhan teh hijau.",
          price: "",
        },
        {
          title: "Croissant",
          description:
            "Inspirasi pastry berlapis sebagai teman secangkir kopi.",
          price: "",
        },
        {
          title: "Roti Kayu Manis",
          description:
            "Konsep pendamping manis dengan aroma rempah yang hangat.",
          price: "",
        },
      ],
    }),
    block("section", "Ruang kecil, cerita panjang", {
      style: "dark",
      body: "Rona adalah gagasan tentang jeda yang terasa seperti pulang. Sebuah konsep ruang untuk menikmati hal sederhana dan membiarkan percakapan menemukan arahnya.",
    }),
    block("features", "Ada ruang untuk hal sederhana", {
      style: "grid",
      items: [
        {
          title: "Menikmati jeda",
          description:
            "Bayangkan sudut tenang untuk melambat dan menikmati suasana.",
          price: "",
        },
        {
          title: "Berbagi cerita",
          description:
            "Gagasan ruang yang mengundang percakapan tanpa terburu-buru.",
          price: "",
        },
        {
          title: "Menemukan inspirasi",
          description:
            "Sebuah konsep tempat untuk memberi ruang bagi ide berikutnya.",
          price: "",
        },
      ],
    }),
    block("image", "Bayangkan suasananya", {
      style: "carousel",
      items: [
        {
          title: "Sudut untuk singgah",
          description: "Ilustrasi ruang kafe; ganti dengan foto interior asli.",
          price: "",
        },
        {
          title: "Di balik secangkir",
          description: "Ilustrasi meja bar; ganti dengan foto bar asli.",
          price: "",
        },
        {
          title: "Detail yang hangat",
          description: "Ilustrasi kopi; ganti dengan foto pilihan Anda.",
          price: "",
        },
      ],
    }),
    block("contact", "Sampai jumpa di Rona", {
      body: "Lengkapi alamat, jam buka, dan kontak Anda untuk mengubah konsep ini menjadi tempat singgah berikutnya.",
    }),
  ],
};
