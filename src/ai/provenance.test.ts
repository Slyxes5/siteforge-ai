import { describe, it, expect } from "vitest";
import { projectSchema, sampleProject } from "../project-schema/project";
import { toPuckData, fromPuckData } from "../editor/project-adapter";
import {
  exportProjectJson,
  parseProjectJson,
} from "../project-schema/project-json";
describe("AI provenance compatibility", () => {
  it("preserves validated AI provenance through editing and JSON interchange", () => {
    const project = {
      ...sampleProject,
      generation: {
        kind: "ai",
        provider: "gemini",
        model: "gemini-3.5-flash-lite",
        promptVersion: 1,
        mode: "live",
      },
    };
    expect(projectSchema.safeParse(project).success).toBe(true);
    const canonical = projectSchema.parse(project);
    expect(fromPuckData(toPuckData(canonical), canonical)).toEqual(canonical);
    expect(parseProjectJson(exportProjectJson(canonical))).toEqual(canonical);
  });
  it("retains old documents and rejects misleading mock/live metadata", () => {
    expect(projectSchema.parse(sampleProject)).toEqual(sampleProject);
    expect(
      projectSchema.safeParse({
        ...sampleProject,
        generation: {
          kind: "ai",
          provider: "mock",
          model: "fixture",
          promptVersion: 1,
          mode: "live",
        },
      }).success,
    ).toBe(false);
  });
});
