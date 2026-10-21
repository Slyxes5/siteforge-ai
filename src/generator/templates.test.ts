import { describe, it, expect } from "vitest";
import { generateProject, templateIds } from "./templates";
import { projectSchema, sampleProject } from "../project-schema/project";
import { fromPuckData, toPuckData } from "../editor/project-adapter";
describe("deterministic template generation", () => {
  it.each(templateIds)(
    "generates editable canonical %s documents without changing old v1 data",
    (templateId) => {
      const input = {
        id: "project-1",
        name: "My Studio",
        description: "A business created for the local community.",
        templateId,
      };
      const project = generateProject(input);
      expect(projectSchema.parse(project)).toEqual(project);
      expect(project).toMatchObject({
        id: input.id,
        name: input.name,
        description: input.description,
        schemaVersion: 1,
        revision: 0,
        generation: { kind: "template", templateId, templateVersion: 1 },
      });
      expect(new Set(project.blocks.map((b) => b.type))).toEqual(
        new Set(["hero", "section", "image", "heading", "paragraph", "button"]),
      );
      expect(fromPuckData(toPuckData(project), project)).toEqual(project);
      expect(generateProject(input)).toEqual(project);
      expect(projectSchema.parse(sampleProject)).toEqual(sampleProject);
    },
  );
  it("uses distinct template copy and validates names and template IDs", () => {
    const input = {
      id: "id",
      name: "Example",
      description: "",
      templateId: templateIds[0],
    };
    const copy = templateIds.map((templateId) =>
      JSON.stringify(generateProject({ ...input, templateId }).blocks),
    );
    expect(new Set(copy).size).toBe(templateIds.length);
    expect(() => generateProject({ ...input, name: "  " })).toThrow();
    expect(() =>
      generateProject({
        ...input,
        templateId: "unknown" as typeof input.templateId,
      }),
    ).toThrow();
  });
});
