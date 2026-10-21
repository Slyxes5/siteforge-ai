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
  onSave,
  canSave = false,
}: {
  project: Project;
  context: string;
  disabled: boolean;
  onApply: (proposal: EditProposal) => boolean;
  onClose: () => void;
  syntheticProvider?: StructuredEditProvider;
  getEditVersion?: () => number;
  onSave?: () => void;
  canSave?: boolean;
}) {
  const requestId = useId();
  const modeId = useId();
  const [mode, setMode] = useState("deterministic");
  const [liveConsent, setLiveConsent] = useState(false);
  const [backendState, setBackendState] = useState("Not checked");
  const isLive = mode === "live-http";
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
    setLiveConsent(false);
    setBackendState("Not checked");
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
  async function createBackendProposal() {
    if (
      disabled ||
      !request.trim() ||
      active.current ||
      (isLive && !liveConsent)
    )
      return;
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
    setBackendState("Checking / generating");
    setCandidate(null);
    setPreview(null);
    setNotice("");
    setError("");
    try {
      const base = structuredClone(project);
      const provider = isLive
        ? createHttpEditProvider(fetch, { mode: "live", consent: liveConsent })
        : (syntheticProvider ?? createHttpEditProvider());
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
      setBackendState("Connected on last request");
    } catch (cause) {
      if (!ownsRequest()) return;
      setBackendState(
        cause instanceof EditClientFailure && cause.outcome === "disabled"
          ? "Disabled on server"
          : "Unavailable or rejected",
      );
      setError(
        isLive
          ? (cause instanceof GenerationFailure ||
              cause instanceof EditClientFailure) &&
            cause.outcome === "timeout"
            ? "AI editing timed out. Nothing was applied. You may try again explicitly."
            : cause instanceof EditClientFailure && cause.outcome === "disabled"
              ? "AI editing is disabled on the server. Offline commands remain available. Nothing was applied."
              : cause instanceof EditClientFailure &&
                  cause.outcome === "refused"
                ? "AI could not produce a supported edit. Clarify the target block and instruction. Nothing was applied."
                : "Could not create a valid AI proposal. Check the backend connection and selected mode, or use offline commands. Nothing was applied."
          : (cause instanceof GenerationFailure ||
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
  const reordered =
    candidate?.proposal.operations.some(
      (operation) => operation.op === "reorder",
    ) ?? false;
  const diffRows = candidate
    ? Array.from(
        new Set(
          [...project.blocks, ...candidate.after.blocks].map(
            (block) => block.id,
          ),
        ),
      ).filter((id) => {
        const beforeIndex = project.blocks.findIndex(
          (block) => block.id === id,
        );
        const afterIndex = candidate.after.blocks.findIndex(
          (block) => block.id === id,
        );
        return (
          JSON.stringify(project.blocks[beforeIndex]) !==
            JSON.stringify(candidate.after.blocks[afterIndex]) ||
          (reordered && beforeIndex !== afterIndex)
        );
      })
    : [];
  return (
    <section
      className="chat-editor"
      aria-label={isLive ? "AI chat editing" : "Mock AI chat editing"}
      aria-busy={pending}
    >
      <header className="chat-heading">
        <div>
          <span className="chat-eyebrow">EDIT YOUR WEBSITE</span>
          <h2>{isLive ? "AI chat editor" : "Mock chat editor"}</h2>
          <p>Describe a change, review it, then decide what to keep.</p>
        </div>
        <button
          type="button"
          className="chat-button"
          onClick={() => {
            invalidateRequest();
            onClose();
          }}
        >
          Close chat editor
        </button>
      </header>
      <ol className="chat-steps" aria-label="Editing workflow">
        <li className={!candidate && !notice ? "current" : ""}>1 · Request</li>
        <li className={candidate && !preview ? "current" : ""}>
          2 · Review & preview
        </li>
        <li className={preview ? "current" : ""}>3 · Apply to draft</li>
        <li className={canSave ? "current" : ""}>4 · Save project</li>
      </ol>
      <div className="chat-compose">
        <div className="chat-mode-row">
          <div>
            <label htmlFor={modeId}>Editing mode</label>
            <select
              id={modeId}
              value={mode}
              disabled={disabled}
              onChange={(event) => {
                invalidateRequest();
                setMode(
                  ["synthetic-http", "live-http"].includes(event.target.value)
                    ? event.target.value
                    : "deterministic",
                );
                setLiveConsent(false);
                setBackendState("Not checked");
                setCandidate(null);
                setPreview(null);
                setError("");
                setNotice("");
              }}
            >
              <option value="deterministic">
                Deterministic commands (offline mock)
              </option>
              <option value="synthetic-http">
                Synthetic backend (mock, HTTP)
              </option>
              <option value="live-http">AI editing (OpenRouter)</option>
            </select>
          </div>
          <span className="chat-badge">
            {mode === "deterministic" ? "Offline · no network" : backendState}
          </span>
        </div>
        {mode === "deterministic" ? (
          <p>
            Deterministic mock command parser — not AI. No model or network
            calls.
          </p>
        ) : isLive ? (
          <p className="chat-mode-help">
            Use natural language, for example: “Ubah judul utama menjadi Selamat
            Datang.” AI editing requires an enabled backend. Availability is
            checked when you submit.
          </p>
        ) : (
          <p>
            Synthetic backend (mock) — named fixture, not live AI. Uses only the
            same-origin edit API. Try:{" "}
            <code>Set the first heading to "Welcome".</code>
          </p>
        )}
        <p className="chat-save-help">
          Apply changes only the unsaved draft. Use Save project separately to
          persist changes.
        </p>
        <details className="chat-reference">
          <summary>Block reference & command examples</summary>
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
            Use one command per line to batch changes. Add properties exclude id
            and type.
          </p>
        </details>
        <label htmlFor={requestId}>Edit request</label>
        <textarea
          id={requestId}
          value={request}
          rows={4}
          maxLength={10000}
          placeholder={
            isLive
              ? "Contoh: Ubah judul utama menjadi Selamat Datang."
              : 'Example: update hero-heading text "Welcome"'
          }
          disabled={disabled}
          onChange={(event) => {
            invalidateRequest();
            setRequest(event.target.value);
            setLiveConsent(false);
            setBackendState("Not checked");
            setCandidate(null);
            setPreview(null);
            setError("");
            setNotice("");
          }}
        />
        {isLive && (
          <label className="chat-consent">
            <input
              type="checkbox"
              checked={liveConsent}
              disabled={disabled}
              onChange={(event) => {
                invalidateRequest();
                setLiveConsent(event.target.checked);
                setBackendState("Not checked");
                setCandidate(null);
                setPreview(null);
                setError("");
                setNotice("");
              }}
            />
            <span>
              Allow this request to send my instruction and the current website
              content to OpenRouter and its model provider. Nothing is applied
              or saved automatically.
            </span>
          </label>
        )}
        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
        <div className="chat-request-actions">
          <button
            type="button"
            className="chat-button chat-primary"
            disabled={
              disabled || pending || !request.trim() || (isLive && !liveConsent)
            }
            onClick={
              mode === "deterministic" ? createProposal : createBackendProposal
            }
          >
            {mode === "deterministic"
              ? "Create mock proposal"
              : isLive
                ? "Create AI proposal"
                : "Create synthetic mock proposal"}
          </button>
          {pending && (
            <p role="status">
              {isLive
                ? "Requesting AI proposal…"
                : "Requesting synthetic mock proposal…"}
            </p>
          )}
          {pending && (
            <button
              type="button"
              className="chat-button"
              onClick={() => {
                invalidateRequest();
                setCandidate(null);
                setPreview(null);
                setError("");
                setNotice(
                  isLive
                    ? "AI request cancelled. Delayed responses will be ignored."
                    : "Mock request cancelled. Delayed responses will be ignored.",
                );
                setBackendState("Request cancelled");
              }}
            >
              {isLive ? "Cancel AI request" : "Cancel mock request"}
            </button>
          )}
        </div>
      </div>
      <div
        className="chat-actionbar"
        role="group"
        aria-label="Proposal actions"
      >
        <button
          type="button"
          className="chat-button"
          disabled={disabled || !candidate}
          onClick={previewProposal}
        >
          Preview proposal
        </button>
        <button
          type="button"
          className="chat-button chat-primary"
          disabled={disabled || !candidate || !preview}
          onClick={applyProposal}
        >
          Apply proposal
        </button>
        <button
          type="button"
          className="chat-button chat-reject"
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
          className="chat-button"
          aria-label="Save edited project"
          disabled={!onSave || !canSave || disabled || pending}
          onClick={onSave}
        >
          Save project
        </button>
      </div>
      <p className="chat-action-help">
        Preview → Apply changes the draft → Save project keeps your changes.
      </p>
      {candidate && (
        <section className="chat-proposal" aria-label="Edit proposal">
          <span className="chat-badge">
            {candidate.proposal.mode === "live"
              ? `AI · ${candidate.proposal.source?.provider} · ${candidate.proposal.source?.model}`
              : "Mock · no live AI"}
          </span>
          <h3>{candidate.proposal.summary}</h3>
          <p>Review the changes below. Preview must be opened before Apply.</p>
          <p>
            {diffRows.length} affected block{diffRows.length === 1 ? "" : "s"}
          </p>
          <details className="chat-reference">
            <summary>Proposal details & raw operations</summary>
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
          </details>
          <div className="chat-diff-scroll">
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
                {diffRows.map((id) => (
                  <tr key={id}>
                    <th scope="row">{id}</th>
                    <td>
                      <pre>
                        {JSON.stringify(
                          project.blocks.find((block) => block.id === id) ??
                            null,
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
          </div>
          {reordered && (
            <>
              <p>
                Before order:{" "}
                {project.blocks.map((block) => block.id).join(", ") ||
                  "(empty)"}
              </p>
              <p>
                After order:{" "}
                {candidate.after.blocks.map((block) => block.id).join(", ") ||
                  "(empty)"}
              </p>
            </>
          )}
        </section>
      )}
      {notice && (
        <p className="chat-notice" role="status">
          {notice}
        </p>
      )}
      {preview && (
        <div className="chat-preview-grid">
          <section className="chat-preview-card" aria-label="Before proposal">
            <h3>Before proposal</h3>
            <ProjectRenderer project={project} />
          </section>
          <section className="chat-preview-card" aria-label="After proposal">
            <h3>After proposal</h3>
            <ProjectRenderer project={preview} />
          </section>
        </div>
      )}
    </section>
  );
}
