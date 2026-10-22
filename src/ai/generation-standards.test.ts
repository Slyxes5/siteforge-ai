import { expect, test } from "vitest";
import {
  completenessProfileIds,
  resolveCompletenessProfile,
  reviewGenerationCompleteness,
} from "./generation-standards";
import { websiteGenerationRequestSchema } from "./website-generation";
import { compileWebsitePlan } from "./website-plan";
import { projectSchema, type Project } from "../project-schema/project";
import { ronaPlan, ronaRequest } from "../../scripts/rona-coffee-scenario";

const provider = { id: "mock" as const, model: "standards-fixture" };
const rona = () =>
  compileWebsitePlan(
    JSON.stringify(ronaPlan),
    ronaRequest,
    provider,
    "standards-rona",
  );
const check = (
  project: Project,
  id: string,
  profile: (typeof completenessProfileIds)[number] = "cafe-restaurant",
) =>
  reviewGenerationCompleteness(project, profile).checks.find(
    (item) => item.id === id,
  )?.present;

test.each([
  ["Website kafe", "cafe-restaurant"],
  ["Café yang hangat", "cafe-restaurant"],
  ["Website restaurant", "cafe-restaurant"],
  ["Katalog produk", "catalog"],
  ["Portofolio dengan layanan jasa desain", "portfolio"],
  ["Jasa rental mobil", "car-rental"],
  ["Website jasa desain", "services"],
  ["Menu navigasi website", "general"],
  ["Bandingkan portofolio dan restoran", "general"],
] as const)("suggests a conservative standard for %s", (prompt, profile) => {
  expect(resolveCompletenessProfile({ prompt })).toBe(profile);
});

test("explicit standard wins and request keeps strict allowlist and backward compatibility", () => {
  const input = { name: "Demo", prompt: "Website kafe" };
  expect(websiteGenerationRequestSchema.parse(input)).toEqual(input);
  for (const profile of completenessProfileIds) {
    const request = websiteGenerationRequestSchema.parse({
      ...input,
      completenessProfile: profile,
    });
    expect(resolveCompletenessProfile(request)).toBe(profile);
  }
  expect(
    websiteGenerationRequestSchema.safeParse({
      ...input,
      completenessProfile: "run-script",
    }).success,
  ).toBe(false);
});

test("Rona has every structural requirement while unknown business facts and synthetic photos remain to fill", () => {
  const project = rona();
  const original = JSON.stringify(project);
  const review = reviewGenerationCompleteness(project, "cafe-restaurant");
  expect(review.checks).toHaveLength(7);
  expect(review.checks.every((item) => item.present)).toBe(true);
  expect(review.needsContent).toHaveLength(5);
  expect(review.needsContent.join(" ")).toMatch(
    /email.*alamat.*jam.*harga.*foto/s,
  );
  expect(JSON.stringify(project)).toBe(original);
  expect(projectSchema.parse(project)).toEqual(project);
});

test("legacy menu without photos and empty descriptions are flagged without filling or rewriting them", () => {
  const project = rona();
  const menu = project.blocks.find((block) => block.type === "menu")!;
  delete menu.items[0].imageSrc;
  menu.items[0].description = " ";
  expect(check(project, "menu")).toBe(false);
  expect(check(project, "menu-photos")).toBe(false);
  menu.items[0].imageSrc = "";
  expect(check(project, "menu-photos")).toBe(true); // Editor renders an empty photo slot.
  expect(menu.items[0].description).toBe(" ");
});

test("CTA needs a real supported destination and labels or empty sections do not pass", () => {
  const project = rona();
  const hero = project.blocks.find((block) => block.type === "hero")!;
  hero.ctaHref = "#missing";
  hero.subtitle = " ";
  for (const block of project.blocks)
    if (block.type === "section") block.body = "";
  expect(check(project, "next-step")).toBe(false);
  expect(check(project, "intro")).toBe(false);
  expect(check(project, "about")).toBe(false);
  hero.ctaHref = "#" + hero.id;
  expect(check(project, "next-step")).toBe(false);
  hero.ctaHref =
    "#" + project.blocks.find((block) => block.type === "menu")!.id;
  expect(check(project, "next-step")).toBe(true);
});

test("portfolio needs captioned work slots and rental needs separate described groups", () => {
  const project = rona();
  expect(check(project, "gallery", "portfolio")).toBe(true);
  const gallery = project.blocks.find((block) => block.type === "gallery")!;
  gallery.items[0].caption = "";
  expect(check(project, "gallery", "portfolio")).toBe(false);
  expect(check(project, "offerings", "car-rental")).toBe(false);
  const group = project.blocks.find((block) => block.type === "features")!;
  project.blocks.push({ ...group, id: "second-group" });
  expect(check(project, "offerings", "car-rental")).toBe(true);
});

test("catalog/menu cards and carousel use neutral host assets outside coffee editorial", () => {
  const plan = structuredClone(ronaPlan);
  plan.blocks[0].style = "";
  const project = compileWebsitePlan(
    JSON.stringify(plan),
    { ...ronaRequest, completenessProfile: "catalog" },
    provider,
    "catalog",
  );
  const menu = project.blocks.find((block) => block.type === "menu")!;
  const gallery = project.blocks.find((block) => block.type === "gallery")!;
  expect(
    menu.items.every((item) => item.imageSrc === "/sample-landscape.svg"),
  ).toBe(true);
  expect(
    gallery.items.every((item) => item.src === "/sample-landscape.svg"),
  ).toBe(true);
  expect(
    reviewGenerationCompleteness(project, "catalog").checks.every(
      (item) => item.present,
    ),
  ).toBe(true);
});

test("a constrained two-block brief is preserved and missing defaults remain advisory", () => {
  const plan = {
    ...ronaPlan,
    blocks: [ronaPlan.blocks[0], ronaPlan.blocks[5]],
  };
  plan.blocks[0] = { ...plan.blocks[0], target: "1" };
  const project = compileWebsitePlan(
    JSON.stringify(plan),
    {
      name: "Demo",
      prompt: "Tepat dua blok hero dan kontak. Jangan buat menu.",
      completenessProfile: "cafe-restaurant",
    },
    provider,
    "two",
  );
  expect(project.blocks.map((block) => block.type)).toEqual([
    "hero",
    "contact",
  ]);
  expect(check(project, "menu")).toBe(false);
  expect(project.blocks).toHaveLength(2);
});
