import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useProjectWorkspace } from "./use-project-workspace";
import { sampleProject } from "../project-schema/project";
import { createProjectLibrary } from "../persistence/project-library";
import { toPuckData } from "../editor/project-adapter";
const other = { ...sampleProject, id: "other", name: "Second project" };
describe("multi-project workspace lifecycle", () => {
  it("ignores stale editor callbacks after switching documents", () => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    const library = createProjectLibrary(localStorage);
    library.insert(sampleProject);
    library.insert(other);
    const { result } = renderHook(() => useProjectWorkspace());
    const staleAccept = result.current.accept;
    const staleSave = result.current.save;
    act(() => {
      result.current.openProject(other.id);
    });
    const oldData = toPuckData({
      ...sampleProject,
      blocks: [{ id: "stale", type: "heading", text: "Old editor late event" }],
    });
    act(() => {
      staleAccept(oldData);
      staleSave(oldData);
    });
    expect(result.current.project).toEqual(other);
    expect(
      library.list().projects.find((project) => project.id === other.id),
    ).toEqual(other);
  });
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    const library = createProjectLibrary(localStorage);
    library.insert(sampleProject);
    library.insert(other);
  });
  afterEach(() => vi.restoreAllMocks());
  it("opens isolated saved documents and restores selection from the URL", () => {
    const { result, unmount } = renderHook(() => useProjectWorkspace());
    act(() => {
      expect(result.current.openProject(other.id)).toBe(true);
    });
    expect(result.current.project).toEqual(other);
    expect(new URLSearchParams(window.location.search).get("project")).toBe(
      other.id,
    );
    unmount();
    const reopened = renderHook(() => useProjectWorkspace());
    expect(reopened.result.current.project).toEqual(other);
  });
  it("requires confirmation before a switch discards a draft", () => {
    const { result } = renderHook(() => useProjectWorkspace());
    act(() => {
      result.current.accept(
        toPuckData({
          ...sampleProject,
          blocks: [{ id: "edited", type: "heading", text: "Unsaved work" }],
        }),
      );
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    act(() => {
      expect(result.current.openProject(other.id)).toBe(false);
    });
    expect(result.current.project.blocks[0].text).toBe("Unsaved work");
    confirm.mockReturnValue(true);
    act(() => {
      expect(result.current.openProject(other.id)).toBe(true);
    });
    expect(result.current.project).toEqual(other);
  });
  it("renames the active saved baseline without losing unsaved editor content", () => {
    const { result } = renderHook(() => useProjectWorkspace());
    act(() => {
      result.current.accept(
        toPuckData({
          ...sampleProject,
          blocks: [{ id: "edited", type: "heading", text: "Keep my draft" }],
        }),
      );
    });
    act(() => {
      expect(result.current.renameProject(sampleProject, "New title")).toBe(
        true,
      );
    });
    expect(result.current.project.name).toBe("New title");
    expect(result.current.project.blocks[0].text).toBe("Keep my draft");
    expect(result.current.dirty).toBe(true);
    act(() => {
      result.current.save();
    });
    expect(result.current.project.revision).toBe(2);
    expect(result.current.dirty).toBe(false);
  });
  it("deleting the active project cannot resurrect its old ID on the next save", () => {
    const { result } = renderHook(() => useProjectWorkspace());
    act(() => {
      expect(result.current.deleteProject(sampleProject)).toBe(true);
    });
    expect(result.current.project.id).not.toBe(sampleProject.id);
    expect(result.current.project.blocks).toEqual([]);
    act(() => {
      result.current.save();
    });
    expect(
      createProjectLibrary(localStorage)
        .list()
        .projects.some((p) => p.id === sampleProject.id),
    ).toBe(false);
  });
});
