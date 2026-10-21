import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { fromPuckData } from "../editor/project-adapter";
import type { Project } from "../project-schema/project";
const VisualEditor = lazy(() => import("../editor/VisualEditor"));
/** Local-only draft. Apply is not a storage operation; the parent retains explicit Save. */
export function CandidateEditor({
  project,
  onApply,
  onCancel,
}: {
  project: Project;
  onApply: (project: Project) => void;
  onCancel: () => void;
}) {
  const alive = useRef(true);
  const [invalid, setInvalid] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function validate(data: unknown, apply: boolean) {
    if (!alive.current) return;
    try {
      const next = fromPuckData(data, project);
      setInvalid(false);
      setDirty(JSON.stringify(next) !== JSON.stringify(project));
      if (apply) onApply(next);
    } catch {
      setInvalid(true);
    }
  }
  return (
    <>
      <p className="manager-help">
        Edit this separate unsaved candidate. Apply returns to preview; only
        Save candidate as new project writes storage.
      </p>
      {invalid && (
        <p className="manager-error" role="alert">
          Candidate edits are invalid. Correct the fields before applying or
          saving.
        </p>
      )}
      <Suspense fallback={<p>Loading candidate editor…</p>}>
        <VisualEditor
          project={project}
          onChange={(data) => validate(data, false)}
          onSave={(data) => validate(data, true)}
          saveLabel="Apply candidate edits"
        />
      </Suspense>
      <button
        className="secondary"
        onClick={() => {
          if (
            (!dirty && !invalid) ||
            window.confirm(
              "Discard unapplied candidate edits and return to the previous preview?",
            )
          )
            onCancel();
        }}
      >
        Discard candidate edits
      </button>
    </>
  );
}
