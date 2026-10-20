import { useEffect, useRef, useState } from "react";
import { sampleProject, type Project } from "../project-schema/project";
import { createLocalProjectStore } from "../persistence/local-project-store";
import { fromPuckData } from "../editor/project-adapter";
import { createProjectLibrary } from "../persistence/project-library";
import {
  previewEditProposal,
  projectSnapshot,
  type EditProposal,
} from "../ai/edit-proposal";
function selectProjectUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id === null) url.searchParams.delete("project");
  else url.searchParams.set("project", id);
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown storage error";
function initialState() {
  try {
    const requestedId = new URLSearchParams(window.location.search).get(
      "project",
    );
    const saved = createLocalProjectStore(window.localStorage).load(
      requestedId ?? sampleProject.id,
    );
    if (requestedId !== null && !saved)
      throw new Error(
        "Requested project not found. Open Projects to select another document.",
      );
    return {
      project: saved ?? sampleProject,
      saved,
      error: "",
      blocked: false,
    };
  } catch (error) {
    return {
      project: sampleProject,
      saved: null,
      error:
        "Could not load project. Existing data was not changed. " +
        message(error),
      blocked: true,
    };
  }
}
export function useProjectWorkspace() {
  const [initial] = useState(initialState);
  const [project, setProject] = useState<Project>(initial.project);
  const current = useRef(project);
  current.current = project;
  const [saved, setSaved] = useState<Project | null>(initial.saved);
  const [error, setError] = useState(initial.error);
  const [blocked, setBlocked] = useState(initial.blocked);
  const [invalid, setInvalidState] = useState(false);
  // Callbacks can run in one React batch before state is committed.
  const invalidNow = useRef(false);
  function setInvalid(value: boolean) {
    invalidNow.current = value;
    setInvalidState(value);
  }
  const [generation, setGeneration] = useState(0);
  // An old Puck instance may finish async work after unmount. Never apply its data to a new document.
  const editorEpoch = useRef(0);
  function advanceEditor() {
    editorEpoch.current += 1;
    setGeneration(editorEpoch.current);
  }
  const [notice, setNotice] = useState("");
  const dirty =
    invalid ||
    saved === null ||
    JSON.stringify(project) !== JSON.stringify(saved);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function accept(data: unknown): Project | null {
    if (generation !== editorEpoch.current) return null;
    try {
      const next = fromPuckData(data, current.current);
      current.current = next;
      setProject(next);
      setInvalid(false);
      if (!blocked) setError("");
      setNotice("");
      return next;
    } catch {
      setInvalid(true);
      setError(
        "Invalid editor data. Check required text and URLs. Nothing was saved; preview is paused until corrected.",
      );
      return null;
    }
  }
  function applyProposal(proposal: EditProposal): boolean {
    if (generation !== editorEpoch.current || blocked || invalidNow.current)
      return false;
    try {
      // Another tab may have saved since this draft was loaded. Never apply against
      // a changed storage baseline, even though Apply itself does not persist.
      const stored = createLocalProjectStore(window.localStorage).load(
        current.current.id,
      );
      if (
        (stored === null) !== (saved === null) ||
        (stored !== null &&
          saved !== null &&
          projectSnapshot(stored) !== projectSnapshot(saved))
      )
        throw new Error(
          "Revision conflict. Reload the saved project before creating a new proposal.",
        );
      const next = previewEditProposal(current.current, proposal);
      current.current = next;
      setProject(next);
      setInvalid(false);
      setError("");
      advanceEditor();
      setNotice(
        "Proposal applied to unsaved draft. Use Save project to persist it.",
      );
      return true;
    } catch (error) {
      setError(
        "Could not apply proposal. Current edits and stored data were preserved. " +
          message(error),
      );
      return false;
    }
  }
  function save(data?: unknown) {
    if (generation !== editorEpoch.current) return;
    const candidate = data === undefined ? current.current : accept(data);
    if (!candidate || blocked || (data === undefined && invalidNow.current))
      return;
    try {
      const next = {
        ...candidate,
        revision: saved === null ? 0 : saved.revision + 1,
      };
      const store = createLocalProjectStore(window.localStorage);
      store.save(next, saved?.revision ?? null);
      const verified = store.load(next.id);
      if (JSON.stringify(verified) !== JSON.stringify(next))
        throw new Error("Save verification failed");
      current.current = next;
      setProject(next);
      setSaved(next);
      setError("");
      setNotice("Project saved locally.");
    } catch (error) {
      setError(
        "Could not save project. Your edits remain in this tab. " +
          message(error),
      );
    }
  }
  function reload() {
    if (
      dirty &&
      !window.confirm("Discard unsaved changes and reload the saved project?")
    )
      return;
    try {
      const loaded = createLocalProjectStore(window.localStorage).load(
        current.current.id,
      );
      if (!loaded) {
        setNotice("No saved project found. Save your current draft first.");
        return;
      }
      current.current = loaded;
      setProject(loaded);
      setSaved(loaded);
      setInvalid(false);
      setBlocked(false);
      setError("");
      advanceEditor();
      setNotice("Saved project reloaded.");
    } catch (error) {
      setError(
        "Could not reload project. Current edits and stored data were preserved. " +
          message(error),
      );
    }
  }
  function openProject(id: string): boolean {
    try {
      const loaded = createLocalProjectStore(window.localStorage).load(id);
      if (!loaded) throw new Error("Project not found");
      if (
        dirty &&
        !window.confirm("Discard unsaved changes and open another project?")
      )
        return false;
      selectProjectUrl(id);
      current.current = loaded;
      setProject(loaded);
      setSaved(loaded);
      setInvalid(false);
      setBlocked(false);
      setError("");
      advanceEditor();
      setNotice("Project opened.");
      return true;
    } catch (error) {
      setError(
        "Could not open project. Current edits were preserved. " +
          message(error),
      );
      return false;
    }
  }
  function renameProject(expected: Project, name: string): boolean {
    try {
      if (
        expected.id === current.current.id &&
        JSON.stringify(saved) !== JSON.stringify(expected)
      )
        throw new Error(
          "Active project baseline conflict. Reload or export your draft before renaming.",
        );
      const next = createProjectLibrary(window.localStorage).rename(
        expected,
        name,
      );
      if (next.id === current.current.id) {
        const draft = {
          ...current.current,
          name: next.name,
          revision: next.revision,
        };
        current.current = draft;
        setProject(draft);
        setSaved(next);
      }
      if (!invalid && !blocked) setError("");
      setNotice(
        "Project renamed. Unsaved content, if any, remains in this tab.",
      );
      return true;
    } catch (error) {
      setError("Could not rename project. " + message(error));
      return false;
    }
  }
  /** The manager must obtain explicit confirmation before calling this operation. */
  function deleteProject(expected: Project): boolean {
    try {
      const active = expected.id === current.current.id;
      const empty = active
        ? {
            ...sampleProject,
            id: crypto.randomUUID(),
            name: "Untitled project",
            blocks: [],
          }
        : null;
      createProjectLibrary(window.localStorage).remove(expected);
      if (empty) {
        selectProjectUrl(null);
        current.current = empty;
        setProject(empty);
        setSaved(null);
        setInvalid(false);
        setBlocked(false);
        advanceEditor();
      }
      if (active || (!invalid && !blocked)) setError("");
      setNotice("Project deleted. Other projects were not changed.");
      return true;
    } catch (error) {
      setError("Could not delete project. " + message(error));
      return false;
    }
  }
  return {
    openProject,
    renameProject,
    deleteProject,
    project,
    dirty,
    error,
    invalid,
    blocked,
    generation,
    notice,
    accept,
    applyProposal,
    save,
    reload,
  };
}
