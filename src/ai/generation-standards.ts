import type { Project } from "../project-schema/project";

export const completenessProfileIds = [
  "general",
  "cafe-restaurant",
  "catalog",
  "services",
  "portfolio",
  "car-rental",
] as const;
export type CompletenessProfile = (typeof completenessProfileIds)[number];
export const completenessProfiles: {
  id: CompletenessProfile;
  label: string;
  guidance: string;
}[] = [
  {
    id: "general",
    label: "Website umum",
    guidance:
      "hero, explanatory section, useful grouped content, contact and an anchored next step",
  },
  {
    id: "cafe-restaurant",
    label: "Kafe / restoran",
    guidance:
      "hero, photo-ready menu items with descriptions and empty unknown prices, story, gallery, contact with address/openingHours left empty when unknown",
  },
  {
    id: "catalog",
    label: "Katalog produk",
    guidance:
      "hero, photo-ready product menu cards with descriptions and empty unknown prices, explanatory section, contact and inquiry CTA; no checkout claims",
  },
  {
    id: "services",
    label: "Jasa / layanan",
    guidance:
      "hero, service features with descriptions, explanatory process/about section, contact and inquiry CTA; no invented credentials",
  },
  {
    id: "portfolio",
    label: "Portofolio",
    guidance:
      "hero introduction, about section, grouped skills/services, gallery of clearly labeled sample work slots, contact and collaboration CTA; no invented client projects",
  },
  {
    id: "car-rental",
    label: "Rental mobil",
    guidance:
      "hero, separate grouped fleet and rental information with descriptions, about section, gallery, contact and inquiry CTA; no invented vehicles, rates, availability or booking backend",
  },
];

/** Shared provider policy; standards supplement, never override a constrained brief. */
export const GENERATION_COMPLETENESS_POLICY = `Completeness standards: use completenessProfile when supplied, otherwise infer the relevant profile from the brief (general if unclear). For open-ended briefs, include the profile's useful sections within existing block/token limits:
${completenessProfiles.map((profile) => `${profile.id}: ${profile.guidance}.`).join("\n")}
These are defaults, not mandatory extra blocks: explicit exclusions, exact block counts/order, and text-only requests take precedence. Use supplied items; if examples are needed, clearly identify them as editable examples in the user's language. Never invent business facts, prices, contact data, testimonials, client work or operational integrations to satisfy completeness. Unknown structured facts stay empty; explain what the owner should fill in. In Website Plan use features style menu-cards for photo-ready menu/products (style menu for an explicitly text-only list), and image style gallery/carousel for work/photo slots. Legacy content uses menu/gallery without unsupported fields.`;

export function resolveCompletenessProfile(input: {
  prompt: string;
  completenessProfile?: CompletenessProfile;
}): CompletenessProfile {
  if (input.completenessProfile) return input.completenessProfile;
  // Conservative local suggestion, not AI analysis. Ambiguous briefs use general.
  const prompt = input.prompt
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const matches: CompletenessProfile[] = [];
  if (
    /\b(kafe|café|cafe|coffee shop|kedai kopi|restoran|restaurant)\b/u.test(
      prompt,
    )
  )
    matches.push("cafe-restaurant");
  if (/\b(katalog|catalog|toko online|online shop|e-commerce)\b/u.test(prompt))
    matches.push("catalog");
  if (/\b(portofolio|portfolio)\b/u.test(prompt)) matches.push("portfolio");
  if (/\b(rental mobil|sewa mobil|car rental)\b/u.test(prompt))
    matches.push("car-rental");
  if (
    matches.length === 0 &&
    /\b(jasa|service business|usaha layanan)\b/u.test(prompt)
  )
    matches.push("services");
  return matches.length === 1 ? matches[0] : "general";
}

export type CompletenessCheck = { id: string; label: string; present: boolean };
/** Structural review only. Does not certify factual accuracy, aesthetics or publish readiness. */
export function reviewGenerationCompleteness(
  project: Project,
  profile: CompletenessProfile,
) {
  const blocks = project.blocks;
  const heroes = blocks.filter((block) => block.type === "hero");
  const groups = blocks.filter((block) => block.type === "features");
  const menus = blocks.filter((block) => block.type === "menu");
  const galleries = blocks.filter((block) => block.type === "gallery");
  const contacts = blocks.filter((block) => block.type === "contact");
  const filled = (value: string | undefined) => Boolean(value?.trim());
  const describedGroups = groups.filter((group) =>
    group.items.every((item) => filled(item.title) && filled(item.description)),
  );
  const menuItems = menus.flatMap((menu) => menu.items);
  const photoReady =
    menuItems.length > 0 &&
    menuItems.every(
      (item) => item.imageSrc !== undefined && filled(item.imageAlt),
    );
  const galleryReady =
    galleries.length > 0 &&
    galleries.every((gallery) =>
      gallery.items.every(
        (item) => filled(item.src) && filled(item.alt) && filled(item.caption),
      ),
    );
  const destinations = new Set(
    blocks
      .filter((block) =>
        ["section", "features", "menu", "gallery", "contact"].includes(
          block.type,
        ),
      )
      .map((block) => block.id),
  );
  const hasTarget = (href: string) =>
    href.startsWith("#")
      ? destinations.has(href.slice(1))
      : /^(https?:\/\/|\/(?!\/))/.test(href);
  const checks: CompletenessCheck[] = [
    {
      id: "intro",
      label: "Hero dengan judul dan pengantar",
      present: heroes.some(
        (hero) => filled(hero.text) && filled(hero.subtitle),
      ),
    },
    {
      id: "about",
      label: "Bagian penjelasan usaha / profil",
      present: blocks.some(
        (block) =>
          block.type === "section" && filled(block.text) && filled(block.body),
      ),
    },
    {
      id: "next-step",
      label: "Tombol tindakan dengan tujuan yang tersedia",
      present: blocks.some((block) =>
        block.type === "hero"
          ? filled(block.ctaText) && hasTarget(block.ctaHref)
          : block.type === "button" &&
            filled(block.text) &&
            hasTarget(block.href),
      ),
    },
    {
      id: "contact",
      label: "Bagian kontak untuk dilengkapi",
      present: contacts.length > 0,
    },
  ];
  if (profile === "cafe-restaurant" || profile === "catalog") {
    checks.push(
      {
        id: "menu",
        label:
          profile === "catalog"
            ? "Daftar produk dengan deskripsi"
            : "Daftar menu dengan deskripsi",
        present:
          menuItems.length > 0 &&
          menuItems.every((item) => filled(item.description)),
      },
      {
        id: "menu-photos",
        label: "Tempat foto dan teks alternatif pada setiap item",
        present: photoReady,
      },
    );
  } else {
    checks.push({
      id: "offerings",
      label:
        profile === "car-rental"
          ? "Kelompok armada dan informasi sewa dengan deskripsi"
          : profile === "portfolio"
            ? "Kelompok keahlian / layanan dengan deskripsi"
            : "Kelompok layanan / informasi dengan deskripsi",
      present: describedGroups.length >= (profile === "car-rental" ? 2 : 1),
    });
  }
  if (["cafe-restaurant", "portfolio", "car-rental"].includes(profile))
    checks.push({
      id: "gallery",
      label:
        profile === "portfolio"
          ? "Galeri karya dengan caption dan teks alternatif"
          : "Galeri dengan caption dan teks alternatif",
      present: galleryReady,
    });

  const needsContent: string[] = [];
  if (
    !contacts.some((contact) => filled(contact.email) || filled(contact.phone))
  )
    needsContent.push(
      "Isi email atau telepon publik agar pengunjung bisa menghubungi Anda.",
    );
  if (["cafe-restaurant", "car-rental"].includes(profile)) {
    if (!contacts.some((contact) => filled(contact.address)))
      needsContent.push("Lengkapi alamat usaha.");
    if (!contacts.some((contact) => filled(contact.openingHours)))
      needsContent.push("Lengkapi jam operasional.");
  }
  if (menuItems.some((item) => !filled(item.price)))
    needsContent.push(
      "Isi harga yang belum tersedia, atau jelaskan cara meminta harga.",
    );
  const images = blocks.flatMap((block) =>
    block.type === "hero"
      ? [block.imageSrc]
      : block.type === "image"
        ? [block.src]
        : block.type === "menu"
          ? block.items.map((item) => item.imageSrc)
          : block.type === "gallery"
            ? block.items.map((item) => item.src)
            : [],
  );
  if (
    images.some(
      (src) =>
        src === "" ||
        src === "/sample-landscape.svg" ||
        src?.startsWith("/graphics/coffee-"),
    )
  )
    needsContent.push(
      "Ganti ilustrasi / placeholder dengan foto atau karya asli milik Anda.",
    );
  return { profile, checks, needsContent };
}
