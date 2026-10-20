import { expect, test } from "vitest";
import { projectSchema, sampleProject } from "./project";
import { fromPuckData, toPuckData } from "../editor/project-adapter";
import {
  exportProjectJson,
  parseProjectJson,
  copyProject,
} from "./project-json";

export const advancedBlocks = [
  {
    id: "services",
    type: "features",
    text: "Services",
    layout: "grid",
    items: [
      { title: "Your service", description: "Add service details." },
      { title: "Another service", description: "" },
    ],
  },
  {
    id: "contact",
    type: "contact",
    text: "Contact",
    body: "Add your verified contact information.",
    email: "",
    phone: "",
    address: "",
  },
];
test("M2C preserves new composite blocks in canonical v1 and Puck round trips", () => {
  const parsed = projectSchema.safeParse({
    ...sampleProject,
    blocks: advancedBlocks,
  });
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  expect(fromPuckData(toPuckData(parsed.data), parsed.data)).toEqual(
    parsed.data,
  );
  expect(parseProjectJson(exportProjectJson(parsed.data))).toEqual(parsed.data);
  expect(copyProject(parsed.data, "new-copy").blocks).toEqual(
    parsed.data.blocks,
  );
  expect(parsed.data.schemaVersion).toBe(1);
  expect(projectSchema.parse(sampleProject)).toEqual(sampleProject);
});
test("M2C rejects unknown nested properties, empty items and invalid layouts", () => {
  for (const block of [
    { ...advancedBlocks[0], items: [] },
    { ...advancedBlocks[0], layout: "arbitrary" },
    {
      ...advancedBlocks[0],
      items: [{ title: "Title", description: "Text", script: "bad" }],
    },
    { ...advancedBlocks[1], submitUrl: "/fake-booking" },
  ])
    expect(
      projectSchema.safeParse({ ...sampleProject, blocks: [block] }).success,
    ).toBe(false);
});
test("M2C accepts legacy prompt provenance and version two without migration", () => {
  for (const promptVersion of [1, 2]) {
    expect(
      projectSchema.safeParse({
        ...sampleProject,
        generation: {
          kind: "ai",
          provider: "mock",
          model: "fixture",
          mode: "mock",
          promptVersion,
        },
      }).success,
    ).toBe(true);
  }
});
