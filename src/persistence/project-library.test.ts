import { describe, it, expect, beforeEach } from "vitest";
import { createProjectLibrary } from "./project-library";
import { sampleProject } from "../project-schema/project";
describe("multi-project canonical storage", () => {
  beforeEach(() => localStorage.clear());
  it("inserts independent IDs and lists legacy data without writing an index", () => {
    const library = createProjectLibrary(localStorage);
    localStorage.setItem(
      "siteforge:project:v1:" + sampleProject.id,
      JSON.stringify(sampleProject),
    );
    const other = { ...sampleProject, id: "another-project", name: "Other" };
    expect(library.insert(other)).toEqual(other);
    expect(
      library
        .list()
        .projects.map((p) => p.id)
        .sort(),
    ).toEqual(["another-project", sampleProject.id].sort());
    expect(localStorage.length).toBe(2);
    expect(
      JSON.parse(
        localStorage.getItem("siteforge:project:v1:" + sampleProject.id)!,
      ),
    ).toEqual(sampleProject);
  });
  it("rejects collisions including corrupt records without overwriting them", () => {
    const library = createProjectLibrary(localStorage);
    const key = "siteforge:project:v1:" + sampleProject.id;
    localStorage.setItem(key, "corrupt");
    expect(() => library.insert(sampleProject)).toThrow("already exists");
    expect(library.list().issues).toHaveLength(1);
    expect(localStorage.getItem(key)).toBe("corrupt");
  });
  it("preserves imported revisions and ignores unrelated browser data", () => {
    const library = createProjectLibrary(localStorage);
    localStorage.setItem("other-app", "not-project-data");
    const imported = { ...sampleProject, id: "imported", revision: 7 };
    expect(library.insert(imported)).toEqual(imported);
    expect(library.list().projects).toEqual([imported]);
    expect(localStorage.getItem("other-app")).toBe("not-project-data");
  });
});
