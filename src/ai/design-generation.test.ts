import { expect, test } from "vitest";
import { compileWebsitePlan } from "./website-plan";
import {
  buildCandidate,
  validateGenerationCandidate,
} from "./generation-content";
import { createEditProposal, previewEditProposal } from "./edit-proposal";
import { designPresetIds } from "../project-schema/design";
import { projectSchema, sampleProject } from "../project-schema/project";
import { fromPuckData, toPuckData } from "../editor/project-adapter";
import {
  exportProjectJson,
  parseProjectJson,
} from "../project-schema/project-json";
import { createLocalProjectStore } from "../persistence/local-project-store";

const input = {
  name: "Studio demo",
  prompt:
    "Website studio kreatif dalam Bahasa Indonesia. Jangan tambahkan fakta bisnis.",
};
const provider = { id: "mock" as const, model: "synthetic-design-fixture" };
const block = (type: string, text: string, extras = {}) => ({
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
  ...extras,
});
const blocks = [
  block("hero", "Ruang untuk ide Anda", {
    body: "Mari berkarya bersama.",
    action: "Kenali studio",
    target: "1",
  }),
  block("section", "Tentang studio", {
    body: "Tambahkan cerita usaha Anda.",
    style: "light",
  }),
];

test.each(designPresetIds)(
  "compiles AI-selected %s while keeping canonical IDs, grounding, and provenance",
  (design) => {
    const project = compileWebsitePlan(
      JSON.stringify({ blocks, design }),
      input,
      provider,
      "design-demo",
    );
    expect(project.design).toEqual({ preset: design });
    expect(project.blocks[0]).toMatchObject({
      id: "design-demo-b0",
      ctaHref: "#design-demo-b1",
    });
    expect(project.generation).toMatchObject({
      provider: "mock",
      mode: "mock",
    });
    expect(validateGenerationCandidate(project, input)).toEqual(project);
  },
);

test("explicit design wins over a different valid model choice and mismatches are rejected at receipt", () => {
  const request = { ...input, designPreference: "ocean-modern" as const };
  const project = compileWebsitePlan(
    JSON.stringify({ blocks, design: "ember-studio" }),
    request,
    provider,
    "design-demo",
  );
  expect(project.design).toEqual({ preset: "ocean-modern" });
  expect(validateGenerationCandidate(project, request)).toEqual(project);
  expect(() =>
    validateGenerationCandidate(
      { ...project, design: { preset: "ember-studio" } },
      request,
    ),
  ).toThrow("design direction");
});

test("legacy generation and projects stay unchanged unless a design is explicitly requested", () => {
  const plain = compileWebsitePlan(
    JSON.stringify({ blocks }),
    input,
    provider,
    "legacy",
  );
  const explicitDefault = compileWebsitePlan(
    JSON.stringify({ blocks, design: "default" }),
    input,
    provider,
    "legacy",
  );
  expect(plain).toEqual(explicitDefault);
  expect(plain).not.toHaveProperty("design");
  expect(projectSchema.parse(sampleProject)).toEqual(sampleProject);
  const raw = JSON.stringify({
    blocks: [{ id: "intro", type: "heading", text: "Karya untuk Anda" }],
  });
  expect(
    buildCandidate(
      raw,
      { ...input, designPreference: "midnight-product" },
      provider,
      "legacy",
    ).design,
  ).toEqual({ preset: "midnight-product" });
});

test.each([
  "unrecognized",
  "url(https://example.com/)",
  { preset: "ocean-modern", css: "body{}" },
])(
  "rejects unsafe/unsupported model design without fallback (%#)",
  (design) => {
    expect(() =>
      compileWebsitePlan(
        JSON.stringify({ blocks, design }),
        input,
        provider,
        "bad",
      ),
    ).toThrow();
  },
);

test("design survives editor round-trip, chat edits, explicit storage and JSON interchange", () => {
  const project = compileWebsitePlan(
    JSON.stringify({ blocks, design: "ember-studio" }),
    input,
    provider,
    "roundtrip",
  );
  const projected = fromPuckData(toPuckData(project), project);
  expect(projected).toEqual(project);
  const proposal = createEditProposal(projected, "Ubah judul menjadi Halo", [
    {
      op: "update",
      blockId: projected.blocks[0].id,
      changes: { text: "Halo" },
    },
  ]);
  const edited = previewEditProposal(projected, proposal);
  expect(edited.design).toEqual(project.design);
  expect(project.blocks[0].text).toBe("Ruang untuk ide Anda");
  const records = new Map<string, string>();
  const store = createLocalProjectStore({
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => {
      records.set(key, value);
    },
  });
  store.save(edited, null);
  expect(store.load(edited.id)).toEqual(edited);
  expect(parseProjectJson(exportProjectJson(edited))).toEqual(edited);
  expect(() =>
    projectSchema.parse({
      ...project,
      design: { preset: "ember-studio", css: "body{}" },
    }),
  ).toThrow();
});
