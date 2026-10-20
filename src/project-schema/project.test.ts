import { describe, it, expect } from "vitest";
import { projectSchema, sampleProject } from "./project";
describe("project schema", () => {
  it("accepts the versioned sample document", () => {
    expect(projectSchema.parse(sampleProject)).toEqual(sampleProject);
  });
  it("rejects unknown versions and invalid revisions", () => {
    expect(
      projectSchema.safeParse({ ...sampleProject, schemaVersion: 2 }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({ ...sampleProject, revision: -1 }).success,
    ).toBe(false);
  });
  it("rejects unknown blocks and undeclared fields", () => {
    expect(
      projectSchema.safeParse({
        ...sampleProject,
        blocks: [{ id: "x", type: "script", text: "unsafe" }],
      }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({ ...sampleProject, unexpected: true }).success,
    ).toBe(false);
  });
});
