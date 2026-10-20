import { useId, useState } from "react";
import { ZodError } from "zod";
import { createMockEditProposal } from "../ai/mock-chat-editor";
import { previewEditProposal, type EditProposal } from "../ai/edit-proposal";
import type { Project } from "../project-schema/project";
import { ProjectRenderer } from "../renderer/ProjectRenderer";

export function ChatEditor({
  project,
  context,
  disabled,
  onApply,
  onClose,
}: {
  project: Project;
  context: string;
  disabled: boolean;
  onApply: (proposal: EditProposal) => boolean;
  onClose: () => void;
}) {
  const requestId = useId();
  const [request, setRequest] = useState("");
  const [candidate, setCandidate] = useState<{
    proposal: EditProposal;
    after: Project;
  } | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Project | null>(null);
  const [notice, setNotice] = useState("");
  const snapshot = JSON.stringify(project);
  const [observed, setObserved] = useState({ snapshot, context, disabled });
  // Invalidate during render, not in an effect: stale controls never commit enabled.
  // Remember every transition, including an invalid edit followed by a restoration.
  if (
    observed.snapshot !== snapshot ||
    observed.context !== context ||
    observed.disabled !== disabled
  ) {
    setObserved({ snapshot, context, disabled });
    if (candidate) {
      setCandidate(null);
      setPreview(null);
      setNotice("");
      setError(
        "The project or editing state changed. The stale proposal was invalidated; create a new proposal.",
      );
    }
  }
  function previewProposal() {
    if (disabled || !candidate) return;
    setPreview(null);
    setError("");
    try {
      setPreview(previewEditProposal(project, candidate.proposal));
    } catch {
      setError(
        "Proposal preview is no longer valid. Reject it and create a new proposal.",
      );
    }
  }
  function applyProposal() {
    if (disabled || !candidate || !preview) return;
    if (onApply(candidate.proposal)) {
      setCandidate(null);
      setPreview(null);
      setError("");
      setNotice(
        "Applied to the unsaved draft. Use Save project separately to persist changes.",
      );
    } else {
      setError(
        "Proposal was not applied. The current draft could not accept it; reject it or try again after checking the draft.",
      );
    }
  }
  function createProposal() {
    if (disabled || !request.trim()) return;
    setCandidate(null);
    setPreview(null);
    setNotice("");
    setError("");
    try {
      const proposal = createMockEditProposal(project, request);
      const after = previewEditProposal(project, proposal);
      setCandidate({ proposal, after });
    } catch (cause) {
      const detail =
        cause instanceof ZodError
          ? "Check required block fields, allowed values and safe URLs."
          : cause instanceof Error
            ? cause.message.slice(0, 600)
            : "Check the commands, block IDs and JSON values.";
      setError("Could not create a valid mock proposal. " + detail);
    }
  }
  return (
    <section aria-label="Mock AI chat editing">
      <h2>Mock chat editor</h2>
      <p>
        Deterministic mock command parser — not AI. No model or network calls.
      </p>
      <p>
        Apply changes only the unsaved draft. Use Save project separately to
        persist changes.
      </p>
      <h3>Current block IDs and types</h3>
      <ul>
        {project.blocks.map((block) => (
          <li key={block.id}>
            {block.id} ({block.type})
          </li>
        ))}
      </ul>
      <h3>Copyable command examples</h3>
      <pre>{`update ${project.blocks[0]?.id ?? "block-id"} text "Welcome"\nadd paragraph after start {"text":"New paragraph"}\nremove ${project.blocks[0]?.id ?? "block-id"}\nreorder ${project.blocks.map((block) => block.id).join(",")}`}</pre>
      <p>
        Use one command per line to batch changes. Add properties exclude id and
        type.
      </p>
      <label htmlFor={requestId}>Edit request</label>
      <textarea
        id={requestId}
        value={request}
        disabled={disabled}
        onChange={(event) => {
          setRequest(event.target.value);
          setCandidate(null);
          setPreview(null);
          setError("");
          setNotice("");
        }}
      />
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        disabled={disabled || !request.trim()}
        onClick={createProposal}
      >
        Create mock proposal
      </button>
      {candidate && (
        <section aria-label="Edit proposal">
          <h3>{candidate.proposal.summary}</h3>
          <dl>
            <dt>Proposal ID</dt>
            <dd>{candidate.proposal.id}</dd>
            <dt>Project ID</dt>
            <dd>{candidate.proposal.projectId}</dd>
            <dt>Base revision</dt>
            <dd>{candidate.proposal.baseRevision}</dd>
            <dt>Request</dt>
            <dd>{candidate.proposal.request}</dd>
          </dl>
          <h4>Operations</h4>
          <pre>{JSON.stringify(candidate.proposal.operations, null, 2)}</pre>
          <table>
            <caption>Operations diff — block IDs, values and order</caption>
            <thead>
              <tr>
                <th scope="col">Block ID</th>
                <th scope="col">Before</th>
                <th scope="col">After</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(
                new Set(
                  [...project.blocks, ...candidate.after.blocks].map(
                    (block) => block.id,
                  ),
                ),
              ).map((id) => (
                <tr key={id}>
                  <th scope="row">{id}</th>
                  <td>
                    <pre>
                      {JSON.stringify(
                        project.blocks.find((block) => block.id === id) ?? null,
                        null,
                        2,
                      )}
                    </pre>
                  </td>
                  <td>
                    <pre>
                      {JSON.stringify(
                        candidate.after.blocks.find(
                          (block) => block.id === id,
                        ) ?? null,
                        null,
                        2,
                      )}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Before order:{" "}
            {project.blocks.map((block) => block.id).join(", ") || "(empty)"}
          </p>
          <p>
            After order:{" "}
            {candidate.after.blocks.map((block) => block.id).join(", ") ||
              "(empty)"}
          </p>
        </section>
      )}
      <button
        type="button"
        disabled={disabled || !candidate}
        onClick={previewProposal}
      >
        Preview proposal
      </button>
      {preview && (
        <>
          <section aria-label="Before proposal">
            <h3>Before proposal</h3>
            <ProjectRenderer project={project} />
          </section>
          <section aria-label="After proposal">
            <h3>After proposal</h3>
            <ProjectRenderer project={preview} />
          </section>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      <button
        type="button"
        disabled={disabled || !candidate || !preview}
        onClick={applyProposal}
      >
        Apply proposal
      </button>
      <button
        type="button"
        disabled={!candidate}
        onClick={() => {
          setCandidate(null);
          setPreview(null);
          setError("");
          setNotice("Proposal rejected. The project was not changed.");
        }}
      >
        Reject proposal
      </button>
      <button type="button" onClick={onClose}>
        Close chat editor
      </button>
    </section>
  );
}
