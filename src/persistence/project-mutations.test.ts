import { describe, it, expect, beforeEach } from "vitest";
import { createProjectLibrary } from "./project-library";
import { sampleProject } from "../project-schema/project";
import { projectKey } from "./local-project-store";
describe("explicit project mutations", () => {
  beforeEach(() => localStorage.clear());
  it("renames only the selected document with a new revision", () => {
    const library = createProjectLibrary(localStorage);
    library.insert(sampleProject);
    const other = { ...sampleProject, id: "other" };
    library.insert(other);
    const next = library.rename(sampleProject, "  New name  ");
    expect(next.name).toBe("New name");
    expect(next.revision).toBe(1);
    expect(JSON.parse(localStorage.getItem(projectKey("other"))!)).toEqual(
      other,
    );
    expect(() => library.rename(sampleProject, "Stale rename")).toThrow(
      "conflict",
    );
  });
  it("removes only the confirmed snapshot and rejects stale deletion", () => {
    const library = createProjectLibrary(localStorage);
    library.insert(sampleProject);
    library.insert({ ...sampleProject, id: "other" });
    expect(() =>
      library.remove({ ...sampleProject, name: "Different snapshot" }),
    ).toThrow("conflict");
    library.remove(sampleProject);
    expect(localStorage.getItem(projectKey(sampleProject.id))).toBeNull();
    expect(library.list().projects.map((p) => p.id)).toEqual(["other"]);
  });
  it("keeps data on failed rename or deletion", () => {
    const library = createProjectLibrary(localStorage);
    library.insert(sampleProject);
    const failing = createProjectLibrary({
      getItem: localStorage.getItem.bind(localStorage),
      setItem: () => {
        throw new Error("Quota");
      },
      removeItem: () => {
        throw new Error("Denied");
      },
      key: localStorage.key.bind(localStorage),
      get length() {
        return localStorage.length;
      },
    });
    expect(() => failing.rename(sampleProject, "Renamed")).toThrow("Quota");
    expect(() => failing.remove(sampleProject)).toThrow("Denied");
    expect(library.list().projects).toEqual([sampleProject]);
  });
});
