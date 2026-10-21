import { expect, test } from "vitest";
import { projectSchema } from "../project-schema/project";
import { compileWebsitePlan } from "./website-plan";
import { validateGenerationCandidate } from "./generation-content";
import { createLocalProjectStore } from "../persistence/local-project-store";
const input = {
  name: "Synthetic coffee",
  prompt:
    "Situs kopi sintetis bahasa Indonesia: hero, layanan, kontak. Detail kontak belum diberikan.",
};
const blank = {
  body: "",
  action: "",
  target: "",
  style: "",
  items: [],
  email: "",
  phone: "",
  address: "",
};
const plan = {
  blocks: [
    {
      ...blank,
      type: "hero",
      text: "Kedai sintetis",
      body: "Placeholder pengantar",
      action: "Kontak",
      target: "2",
    },
    {
      ...blank,
      type: "features",
      text: "Layanan",
      items: [
        { title: "Menu", description: "Tambahkan menu terverifikasi." },
        { title: "Kunjungan", description: "Tambahkan detail yang benar." },
      ],
    },
    {
      ...blank,
      type: "contact",
      text: "Kontak",
      body: "Informasi kontak belum diberikan.",
    },
  ],
};
test("approved additive OpenRouter provenance compiles, validates and round-trips v1 without migrations", () => {
  const candidate = compileWebsitePlan(
    JSON.stringify(plan),
    input,
    { id: "openrouter", model: "nvidia/nemotron-3.5-super-vl:free" },
    "or-candidate",
  );
  expect(candidate.schemaVersion).toBe(1);
  expect(candidate.generation).toMatchObject({
    kind: "ai",
    provider: "openrouter",
    mode: "live",
  });
  expect(validateGenerationCandidate(candidate, input)).toEqual(candidate);
  expect(candidate.blocks.map((b) => b.type)).toEqual([
    "hero",
    "features",
    "contact",
  ]);
  const records = new Map<string, string>();
  const storage = {
    getItem: (k: string) => records.get(k) ?? null,
    setItem: (k: string, v: string) => {
      records.set(k, v);
    },
  };
  const store = createLocalProjectStore(storage);
  store.save(candidate, null);
  expect(store.load(candidate.id)).toEqual(candidate);
});
test("Gemini, mock and legacy documents retain exact existing schema behavior", () => {
  const base = {
    schemaVersion: 1,
    id: "legacy",
    name: "Legacy",
    revision: 0,
    blocks: [],
  };
  expect(projectSchema.parse(base)).toEqual(base);
  for (const [provider, mode] of [
    ["gemini", "live"],
    ["mock", "mock"],
  ] as const) {
    const value = {
      ...base,
      generation: {
        kind: "ai",
        provider,
        mode,
        model: "legacy",
        promptVersion: 2,
      },
    };
    expect(projectSchema.parse(value)).toEqual(value);
  }
  expect(
    projectSchema.safeParse({
      ...base,
      generation: {
        kind: "ai",
        provider: "openrouter",
        mode: "mock",
        model: "test",
        promptVersion: 2,
      },
    }).success,
  ).toBe(false);
});
