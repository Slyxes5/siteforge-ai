import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useProjectWorkspace } from "./use-project-workspace";
import { createMockEditProposal } from "../ai/mock-chat-editor";
import { sampleProject } from "../project-schema/project";
import { toPuckData } from "../editor/project-adapter";
const key = "siteforge:project:v1:" + sampleProject.id;

describe("mock chat workspace boundary", () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, "", "/");
  });
  it("exposes explicit proposal application without persisting a draft", () => {
    const { result } = renderHook(() => useProjectWorkspace());
    expect(result.current).toHaveProperty(
      "applyProposal",
      expect.any(Function),
    );
    expect(localStorage.length).toBe(0);
  });
  it("Apply preserves storage/revision and rejects old editor callbacks", () => {
    localStorage.setItem(key, JSON.stringify(sampleProject));
    const { result } = renderHook(() => useProjectWorkspace());
    const proposal = createMockEditProposal(
      result.current.project,
      'update hero-heading text "Reviewed headline"',
    );
    const oldAccept = result.current.accept;
    const oldSave = result.current.save;
    act(() => {
      expect(result.current.applyProposal(proposal)).toBe(true);
    });
    expect(result.current.project.revision).toBe(0);
    expect(result.current.project.blocks[0].text).toBe("Reviewed headline");
    expect(localStorage.getItem(key)).toBe(JSON.stringify(sampleProject));
    act(() => {
      expect(oldAccept(toPuckData(sampleProject))).toBeNull();
      oldSave(toPuckData(sampleProject));
    });
    expect(result.current.project.blocks[0].text).toBe("Reviewed headline");
    expect(localStorage.getItem(key)).toBe(JSON.stringify(sampleProject));
    act(() => result.current.save());
    expect(JSON.parse(localStorage.getItem(key)!).revision).toBe(1);
  });
  it("rejects same-revision changed drafts, malformed proposals and invalid editor state", () => {
    localStorage.setItem(key, JSON.stringify(sampleProject));
    const { result } = renderHook(() => useProjectWorkspace());
    const proposal = createMockEditProposal(
      result.current.project,
      'update hero-heading text "Reviewed headline"',
    );
    const changed = {
      ...sampleProject,
      blocks: sampleProject.blocks.map((b, i) =>
        i ? b : { ...b, text: "Manual draft" },
      ),
    };
    act(() => {
      result.current.accept(toPuckData(changed));
    });
    act(() => {
      expect(result.current.applyProposal(proposal)).toBe(false);
    });
    expect(result.current.project.blocks[0].text).toBe("Manual draft");
    act(() => {
      expect(
        result.current.applyProposal({ ...proposal, operations: [] }),
      ).toBe(false);
    });
    const fresh = createMockEditProposal(
      result.current.project,
      'update hero-heading text "Fresh proposal"',
    );
    act(() => {
      result.current.accept({});
    });
    act(() => {
      expect(result.current.applyProposal(fresh)).toBe(false);
    });
    expect(localStorage.getItem(key)).toBe(JSON.stringify(sampleProject));
  });
  it("refuses Apply and Save synchronously after invalid editor input in the same React batch", () => {
    localStorage.setItem(key, JSON.stringify(sampleProject));
    const { result } = renderHook(() => useProjectWorkspace());
    const proposal = createMockEditProposal(
      result.current.project,
      "remove hero-copy",
    );
    act(() => {
      result.current.accept({});
      expect(result.current.applyProposal(proposal)).toBe(false);
      result.current.save();
    });
    expect(result.current.invalid).toBe(true);
    expect(result.current.project).toEqual(sampleProject);
    expect(localStorage.getItem(key)).toBe(JSON.stringify(sampleProject));
  });
  it("rejects old Apply callbacks after workspace Reload", () => {
    localStorage.setItem(key, JSON.stringify(sampleProject));
    const { result } = renderHook(() => useProjectWorkspace());
    const proposal = createMockEditProposal(
      result.current.project,
      "remove hero-copy",
    );
    const oldApply = result.current.applyProposal;
    act(() => result.current.reload());
    act(() => {
      expect(oldApply(proposal)).toBe(false);
    });
    expect(result.current.project).toEqual(sampleProject);
    expect(localStorage.getItem(key)).toBe(JSON.stringify(sampleProject));
  });
  it("rejects an old Apply callback after invalid input is restored in one React batch", () => {
    localStorage.setItem(key, JSON.stringify(sampleProject));
    const { result } = renderHook(() => useProjectWorkspace());
    const original = structuredClone(result.current.project);
    const proposal = createMockEditProposal(
      original,
      'update hero-heading text "Reviewed headline"',
    );
    const oldApply = result.current.applyProposal;
    act(() => {
      result.current.accept({});
      result.current.accept(toPuckData(original));
      expect(oldApply(proposal)).toBe(false);
    });
    expect(result.current.project).toEqual(original);
    expect(localStorage.getItem(key)).toBe(JSON.stringify(sampleProject));
  });
  it("preserves corrupt storage and refuses Apply in a blocked workspace", () => {
    localStorage.setItem(key, "corrupt");
    const { result } = renderHook(() => useProjectWorkspace());
    const proposal = createMockEditProposal(sampleProject, "remove hero-copy");
    act(() => {
      expect(result.current.applyProposal(proposal)).toBe(false);
    });
    expect(result.current.blocked).toBe(true);
    expect(localStorage.getItem(key)).toBe("corrupt");
    expect(result.current.project).toEqual(sampleProject);
  });
  it("rejects a changed stored baseline even when another tab reused its revision", () => {
    localStorage.setItem(key, JSON.stringify(sampleProject));
    const { result } = renderHook(() => useProjectWorkspace());
    const proposal = createMockEditProposal(
      result.current.project,
      "remove hero-copy",
    );
    const other = { ...sampleProject, name: "Same revision other tab" };
    localStorage.setItem(key, JSON.stringify(other));
    act(() => {
      expect(result.current.applyProposal(proposal)).toBe(false);
    });
    expect(result.current.project).toEqual(sampleProject);
    expect(localStorage.getItem(key)).toBe(JSON.stringify(other));
    expect(result.current.error).toContain("Revision conflict");
  });
});
