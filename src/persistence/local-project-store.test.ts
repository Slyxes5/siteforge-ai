import { describe, it, expect, beforeEach } from "vitest";
import { createLocalProjectStore } from "./local-project-store";
import { sampleProject } from "../project-schema/project";
describe("local project persistence foundation", () => {
  beforeEach(() => localStorage.clear());
  it("round-trips a validated project and reports missing data", () => {
    const store = createLocalProjectStore(localStorage);
    expect(store.load(sampleProject.id)).toBeNull();
    store.save(sampleProject, null);
    expect(store.load(sampleProject.id)).toEqual(sampleProject);
  });
  it("prevents silent overwrite and requires the next revision", () => {
    const store = createLocalProjectStore(localStorage);
    store.save(sampleProject, null);
    expect(() => store.save({ ...sampleProject, revision: 1 }, null)).toThrow(
      "Revision conflict",
    );
    expect(() => store.save({ ...sampleProject, revision: 3 }, 0)).toThrow(
      "Expected next revision",
    );
    store.save({ ...sampleProject, revision: 1 }, 0);
    expect(store.load(sampleProject.id)?.revision).toBe(1);
  });
  it("reports corrupt data and leaves it untouched", () => {
    const store = createLocalProjectStore(localStorage);
    localStorage.setItem("siteforge:project:v1:" + sampleProject.id, "broken");
    expect(() => store.load(sampleProject.id)).toThrow();
    expect(() => store.save(sampleProject, null)).toThrow();
    expect(
      localStorage.getItem("siteforge:project:v1:" + sampleProject.id),
    ).toBe("broken");
  });
});
