import { describe, it, expect } from "vitest";
import {
  parseProjectJson,
  exportProjectJson,
  copyProject,
  MAX_PROJECT_FILE_BYTES,
} from "./project-json";
import { sampleProject } from "./project";
import { generateProject } from "../generator/templates";
describe("canonical JSON interchange", () => {
  it("round trips legacy and generated documents without data loss", () => {
    for (const project of [
      sampleProject,
      generateProject({
        id: "generated",
        name: "Studio",
        description: "Local studio",
        templateId: "portfolio",
      }),
    ])
      expect(parseProjectJson(exportProjectJson(project))).toEqual(project);
  });
  it("rejects invalid JSON, unknown fields/versions and oversized input", () => {
    expect(() => parseProjectJson("broken")).toThrow();
    expect(() =>
      parseProjectJson(JSON.stringify({ ...sampleProject, schemaVersion: 2 })),
    ).toThrow();
    expect(() =>
      parseProjectJson(JSON.stringify({ ...sampleProject, unknown: true })),
    ).toThrow();
    expect(() =>
      parseProjectJson(" ".repeat(MAX_PROJECT_FILE_BYTES + 1)),
    ).toThrow("too large");
    expect(() =>
      exportProjectJson({ ...sampleProject, revision: -1 }),
    ).toThrow();
  });
  it("copies only after an explicit identity change without mutating the original", () => {
    const copied = copyProject({ ...sampleProject, revision: 8 }, "fresh-id");
    expect(copied).toEqual({ ...sampleProject, id: "fresh-id", revision: 0 });
    expect(sampleProject.id).toBe("siteforge-starter");
    expect(() => copyProject(sampleProject, sampleProject.id)).toThrow(
      "different",
    );
  });
});
