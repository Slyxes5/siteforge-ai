import { describe, it, expect } from "vitest";
import { applyChanges } from "./changes";
import { sampleProject } from "../project-schema/project";
describe("structured changes", () => {
  it("applies a validated text change without mutating the source", () => {
    const next = applyChanges(sampleProject, {
      projectId: sampleProject.id,
      baseRevision: 0,
      operations: [
        { type: "setText", blockId: "hero-heading", text: "New heading" },
      ],
    });
    expect(next.blocks[0].text).toBe("New heading");
    expect(next.revision).toBe(1);
    expect(sampleProject.blocks[0].text).not.toBe("New heading");
  });
  it("rejects stale, wrong-project, invalid and unknown-target changes", () => {
    const change = {
      projectId: sampleProject.id,
      baseRevision: 0,
      operations: [{ type: "setText", blockId: "hero-heading", text: "New" }],
    };
    expect(() =>
      applyChanges(sampleProject, { ...change, baseRevision: 9 }),
    ).toThrow("Revision conflict");
    expect(() =>
      applyChanges(sampleProject, { ...change, projectId: "other" }),
    ).toThrow("Project mismatch");
    expect(() =>
      applyChanges(sampleProject, {
        ...change,
        operations: [{ type: "setText", blockId: "missing", text: "New" }],
      }),
    ).toThrow("Unknown block");
    expect(() =>
      applyChanges(sampleProject, {
        ...change,
        operations: [{ type: "setText", blockId: "hero-heading", text: "" }],
      }),
    ).toThrow();
  });
});
