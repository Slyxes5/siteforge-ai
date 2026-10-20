import { useEffect, useId, useRef, useState } from "react";
import { ZodError } from "zod";
import { createMockEditProposal } from "../ai/mock-chat-editor";
import {
  previewEditProposal,
  projectSnapshot,
  type EditProposal,
} from "../ai/edit-proposal";
import type { Project } from "../project-schema/project";
import { ProjectRenderer } from "../renderer/ProjectRenderer";
import {
  createStructuredEditProposal,
  type StructuredEditProvider,
} from "../ai/structured-edit";
import { GenerationFailure } from "../ai/generation-runtime";
import { createHttpEditProvider, EditClientFailure } from "../ai/edit-client";

export function ChatEditor({
  project,
  context,
  disabled,
  onApply,
  onClose,
  syntheticProvider,
  getEditVersion,
}: {
  project: Project;
  context: string;
  disabled: boolean;
  onApply: (proposal: EditProposal) => boolean;
  onClose: () => void;
  syntheticProvider?: StructuredEditProvider;
  getEditVersion?: () => number;
}) {
  const requestId = useId();
  const modeId = useId();
  const [mode, setMode] = useState("deterministic");
  const [pending, setPending] = useState(false);
  const active = useRef<{ controller: AbortController; ticket: number } | null>(
    null,
  );
  const sequence = useRef(0);
  const mounted = useRef(true);
  const [request, setRequest] = useState("");
  const [candidate, setCandidate] = useState<{
    proposal: EditProposal;
    after: Project;
    editVersion?: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Project | null>(null);
  const [notice, setNotice] = useState("");
  const snapshot = projectSnapshot(project);
  const editVersion = getEditVersion?.();
  const latest = useRef({
    project,
    snapshot,
    context,
    disabled,
    request,
    mode,
  });
  latest.current = { project, snapshot, context, disabled, request, mode };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
      active.current?.controller.abort();
      active.current = null;
    };
  }, []);
  function invalidateRequest() {
    sequence.current += 1;
    active.current?.controller.abort();
    active.current = null;
    setPending(false);
  }
  const [observed, setObserved] = useState({
    snapshot,
    context,
    disabled,
    editVersion,
  });
  // Invalidate during render, not in an effect: stale controls never commit enabled.
  // Remember every transition, including an invalid edit followed by a restoration.
  if (
    observed.snapshot !== snapshot ||
    observed.context !== context ||
    observed.disabled !== disabled ||
    observed.editVersion !== editVersion
  ) {
    setObserved({ snapshot, context, disabled, editVersion });
    if (candidate || active.current) {
      invalidateRequest();
      setCandidate(null);
      setPreview(null);
      setNotice("");
      setError(
        "The project or editing state changed. The stale proposal was invalidated; create a new proposal.",
      );
    }
  }
  function previewProposal() {
    if (disabled || active.current || !candidate) return;
    setPreview(null);
    setError("");
    try {
      if (getEditVersion?.() !== candidate.editVersion)
        throw new Error("Stale edit session.");
      setPreview(previewEditProposal(project, candidate.proposal));
    } catch {
      setError(
        "Proposal preview is no longer valid. Reject it and create a new proposal.",
      );
    }
  }
  function applyProposal() {
    if (disabled || active.current || !candidate || !preview) return;
    if (getEditVersion?.() !== candidate.editVersion) {
      setCandidate(null);
      setPreview(null);
      setError(
        "The editing session changed. Create and preview a new proposal.",
      );
      return;
    }
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
      setCandidate({ proposal, after, editVersion });
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
  async function createSyntheticProposal() {
    if (disabled || !request.trim() || active.current) return;
    const controller = new AbortController();
    const ticket = ++sequence.current;
    const started = { snapshot, context, request, mode, editVersion };
    active.current = { controller, ticket };
    const ownsRequest = () =>
      mounted.current &&
      active.current?.ticket === ticket &&
      sequence.current === ticket &&
      latest.current.snapshot === started.snapshot &&
      latest.current.context === started.context &&
      latest.current.request === started.request &&
      latest.current.mode === started.mode &&
      !latest.current.disabled &&
      getEditVersion?.() === started.editVersion;
    setPending(true);
    setCandidate(null);
    setPreview(null);
    setNotice("");
    setError("");
    try {
      const base = structuredClone(project);
      const provider = syntheticProvider ?? createHttpEditProvider();
      const proposal = await createStructuredEditProposal(
        base,
        request,
        provider,
        controller.signal,
      );
      if (!ownsRequest() || controller.signal.aborted) return;
      const after = previewEditProposal(latest.current.project, proposal);
      if (!ownsRequest() || controller.signal.aborted) return;
      setCandidate({ proposal, after, editVersion });
    } catch (cause) {
      if (!ownsRequest()) return;
      setError(
        (cause instanceof GenerationFailure ||
          cause instanceof EditClientFailure) &&
          cause.outcome === "timeout"
          ? "Synthetic mock editing timed out. Nothing was applied. You may try again explicitly or use deterministic commands offline."
          : cause instanceof EditClientFailure && cause.outcome === "disabled"
            ? "Synthetic backend editing is disabled. Choose deterministic commands to edit offline. Nothing was applied."
            : "Could not create a valid synthetic mock proposal. The backend may be disabled or unavailable. Choose deterministic commands to edit offline. Nothing was applied.",
      );
    } finally {
      if (mounted.current && active.current?.ticket === ticket) {
        active.current = null;
        setPending(false);
      }
    }
  }
  return (
    <section aria-label="Mock AI chat editing" aria-busy={pending}>
      <h2>Mock chat editor</h2>
      <label htmlFor={modeId}>Editing mode</label>
      <select
        id={modeId}
        value={mode}
        disabled={disabled}
        onChange={(event) => {
          invalidateRequest();
          setMode(
            event.target.value === "synthetic-http"
              ? "synthetic-http"
              : "deterministic",
          );
          setCandidate(null);
          setPreview(null);
          setError("");
          setNotice("");
        }}
      >
        <option value="deterministic">
          Deterministic commands (offline mock)
        </option>
        <option value="synthetic-http">Synthetic backend (mock, HTTP)</option>
      </select>
      {mode === "deterministic" ? (
        <p>
          Deterministic mock command parser — not AI. No model or network calls.
        </p>
      ) : (
        <p>
          Synthetic backend (mock) — named fixture, not live AI. Uses only the
          same-origin edit API. Try:{" "}
          <code>Set the first heading to "Welcome".</code>
        </p>
      )}
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
          invalidateRequest();
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
        disabled={disabled || pending || !request.trim()}
        onClick={
          mode === "deterministic" ? createProposal : createSyntheticProposal
        }
      >
        {mode === "deterministic"
          ? "Create mock proposal"
          : "Create synthetic mock proposal"}
      </button>
      {pending && <p role="status">Requesting synthetic mock proposal…</p>}
      {pending && (
        <button
          type="button"
          onClick={() => {
            invalidateRequest();
            setCandidate(null);
            setPreview(null);
            setError("");
            setNotice(
              "Mock request cancelled. Delayed responses will be ignored.",
            );
          }}
        >
          Cancel mock request
        </button>
      )}
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
      <button
        type="button"
        onClick={() => {
          invalidateRequest();
          onClose();
        }}
      >
        Close chat editor
      </button>
    </section>
  );
}
