/** Fixed synthetic acceptance data. No user facts or credentials. */
export const coffeeAcceptance = {
  id: "coffee-shop",
  name: "SiteForge Coffee Acceptance",
  prompt:
    "Create a synthetic coffee shop website in Indonesian with exactly three blocks in this order: hero, features, contact. Hero id must be intro, headline must be Kedai Kopi Uji SiteForge, subtitle must clearly label this as synthetic placeholder content, ctaText must be Kontak and ctaHref must be #contact. Features id must be services, title must be Pilihan kedai, layout must be grid, with exactly two items titled Menu kopi and Kunjungan. Item descriptions must be placeholder instructions, not claims about real products or services. Contact id must be contact, title must be Kontak, body must be Informasi kontak belum diberikan.; email, phone and address must all be empty strings. Do not add images, external links, prices, phone numbers, addresses, email addresses, opening hours, certifications, testimonials, factual business claims, other blocks or fields.",
  blockTypes: ["hero", "features", "contact"],
} as const;
export const coffeeMockContent = {
  blocks: [
    {
      id: "intro",
      type: "hero",
      text: "Kedai Kopi Uji SiteForge",
      subtitle: "Konten sintetis — placeholder, bukan informasi usaha nyata.",
      ctaText: "Kontak",
      ctaHref: "#contact",
    },
    {
      id: "services",
      type: "features",
      text: "Pilihan kedai",
      layout: "grid",
      items: [
        {
          title: "Menu kopi",
          description: "Tambahkan menu yang telah Anda verifikasi.",
        },
        {
          title: "Kunjungan",
          description: "Tambahkan informasi kunjungan yang benar.",
        },
      ],
    },
    {
      id: "contact",
      type: "contact",
      text: "Kontak",
      body: "Informasi kontak belum diberikan.",
      email: "",
      phone: "",
      address: "",
    },
  ],
};
