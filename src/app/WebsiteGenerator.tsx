import { useEffect, useRef, useState } from "react";
import { CandidateEditor } from "./CandidateEditor";
import { generateWebsite } from "../ai/generation-client";
import {
  abortableGeneration,
  GenerationFailure,
} from "../ai/generation-runtime";
import { validateGenerationCandidate } from "../ai/generation-content";
import {
  GENERATION_LIMITS,
  websiteGenerationRequestSchema,
} from "../ai/website-generation";
import {
  generateProject,
  templates,
  type TemplateId,
} from "../generator/templates";
import { createProjectLibrary } from "../persistence/project-library";
import { ProjectRenderer } from "../renderer/ProjectRenderer";
import type { Project } from "../project-schema/project";
import { StudioIcon } from "./StudioIcon";
import { designPresets, type DesignPreset } from "../project-schema/design";
import type {
  GenerationDiagnostics,
  GenerationOutcome,
} from "../ai/generation-observation";
type GenerationReceipt = Partial<GenerationDiagnostics> & {
  requestId: string;
  startedAt: string;
  diagnosticsOrigin: "client" | "server";
};
export type GeneratorProps = {
  context: string;
  onClose: () => void;
  onOpen: (id: string) => boolean;
  generate?: typeof generateWebsite;
};
export function WebsiteGenerator({
  context,
  onClose,
  onOpen,
  generate = generateWebsite,
}: GeneratorProps) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [designPreference, setDesignPreference] = useState<DesignPreset | "">(
    "",
  );
  const [template, setTemplate] = useState<TemplateId>("business");
  const [candidate, setCandidate] = useState<Project | null>(null);
  const [saved, setSaved] = useState(false);
  const [editSession, setEditSession] = useState<{
    ticket: number;
    context: string;
    candidateId: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [generationState, setGenerationState] = useState<
    "idle" | "generating" | GenerationOutcome
  >("idle");
  const [receipt, setReceipt] = useState<GenerationReceipt | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const epoch = useRef(0);
  const active = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const savedRef = useRef(false);
  const currentContext = useRef(context);
  const promptField = useRef<HTMLTextAreaElement>(null);
  currentContext.current = context;
  useEffect(() => {
    epoch.current += 1;
    setEditSession(null);
    active.current?.abort();
    active.current = null;
    setBusy(false);
    if (busy) {
      setGenerationState("cancelled");
      setReceipt((previous) =>
        previous
          ? {
              ...previous,
              outcome: "cancelled",
              diagnosticsOrigin: "client",
              finishedAt: new Date().toISOString(),
              durationMs: Math.max(
                0,
                Date.now() - Date.parse(previous.startedAt),
              ),
            }
          : null,
      );
      setNotice(
        "Generation cancelled after switching projects. Delayed results will be ignored.",
      );
    }
    return () => {
      epoch.current += 1;
      active.current?.abort();
      active.current = null;
    };
  }, [context]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (busy || (candidate && !saved)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy, candidate, saved]);
  function cancel() {
    if (active.current) {
      setGenerationState("cancelled");
      setReceipt((previous) =>
        previous
          ? {
              ...previous,
              outcome: "cancelled",
              diagnosticsOrigin: "client",
              finishedAt: new Date().toISOString(),
              durationMs: Math.max(
                0,
                Date.now() - Date.parse(previous.startedAt),
              ),
            }
          : null,
      );
    }
    epoch.current += 1;
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setNotice("Generation cancelled. Delayed results will be ignored.");
  }
  function replaceAllowed() {
    return (
      !candidate ||
      saved ||
      window.confirm("Discard the unsaved candidate and generate another one?")
    );
  }
  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (active.current || !replaceAllowed()) return;
    const request = websiteGenerationRequestSchema.safeParse({
      name,
      prompt,
      ...(designPreference ? { designPreference } : {}),
    });
    if (!request.success) {
      setGenerationState("validation_error");
      setError("Enter a website name and a prompt of at most 4000 characters.");
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    const ticket = ++epoch.current;
    setEditSession(null);
    const startedContext = context;
    setBusy(true);
    setGenerationState("generating");
    const initialReceipt: GenerationReceipt = {
      requestId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      schemaValidation: "not_attempted",
      diagnosticsOrigin: "client",
    };
    setReceipt(initialReceipt);
    const complete = (
      outcome: GenerationOutcome,
      diagnostics?: GenerationDiagnostics,
    ) => {
      setGenerationState(outcome);
      setReceipt((previous) =>
        diagnostics
          ? { ...diagnostics, diagnosticsOrigin: "server" }
          : {
              ...initialReceipt,
              ...previous,
              outcome,
              finishedAt: new Date().toISOString(),
              durationMs: Math.max(
                0,
                Date.now() - Date.parse(initialReceipt.startedAt),
              ),
              schemaValidation:
                outcome === "success"
                  ? "valid"
                  : outcome === "validation_error"
                    ? "invalid"
                    : "not_attempted",
            },
      );
    };
    setError("");
    setNotice("");
    setCandidate(null);
    setSaved(false);
    savedRef.current = false;
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException("Generation deadline", "TimeoutError"),
        ),
      GENERATION_LIMITS.totalTimeoutMs,
    );
    try {
      const result = await abortableGeneration(
        () =>
          generate(request.data, controller.signal, undefined, {
            onRequestId: (id) => {
              if (
                ticket === epoch.current &&
                currentContext.current === startedContext
              )
                setReceipt((previous) =>
                  previous ? { ...previous, requestId: id } : null,
                );
            },
          }),
        controller.signal,
      );
      if (ticket !== epoch.current || currentContext.current !== startedContext)
        return;
      controller.signal.throwIfAborted();
      let project: Project;
      try {
        project = validateGenerationCandidate(result.candidate, request.data);
      } catch {
        throw new GenerationFailure(
          "validation_error",
          "Invalid generation candidate. Nothing was saved.",
        );
      }
      if (
        project.generation?.kind !== "ai" ||
        project.generation.mode !== result.mode
      )
        throw new GenerationFailure(
          "validation_error",
          "Invalid candidate provenance. Nothing was saved.",
        );
      complete("success", result.diagnostics);
      setCandidate(project);
      setNotice(
        "Validated candidate only. Nothing has been saved or replaced.",
      );
    } catch (reason) {
      if (
        ticket === epoch.current &&
        currentContext.current === startedContext
      ) {
        const outcome =
          reason instanceof GenerationFailure
            ? reason.outcome
            : controller.signal.aborted
              ? controller.signal.reason?.name === "TimeoutError"
                ? "timeout"
                : "cancelled"
              : "provider_error";
        complete(
          outcome,
          reason instanceof GenerationFailure ? reason.diagnostics : undefined,
        );
        setError(
          reason instanceof GenerationFailure
            ? reason.message
            : "Generation failed. Nothing was saved.",
        );
      }
    } finally {
      clearTimeout(timer);
      if (ticket === epoch.current) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  function fallback() {
    if (active.current || !replaceAllowed()) return;
    try {
      const request = websiteGenerationRequestSchema.parse({ name, prompt });
      const project = generateProject({
        id: crypto.randomUUID(),
        name: request.name,
        description: request.prompt,
        templateId: template,
      });
      epoch.current += 1;
      setEditSession(null);
      setGenerationState("idle");
      setReceipt(null);
      setCandidate({
        ...project,
        ...(designPreference ? { design: { preset: designPreference } } : {}),
      });
      setSaved(false);
      savedRef.current = false;
      setError("");
      setNotice(
        "Local template candidate only. No AI was used and nothing was saved.",
      );
    } catch {
      setError(
        "Enter a website name and prompt before using the template fallback.",
      );
    }
  }
  function saveCandidate() {
    if (!candidate || editSession || saving.current || savedRef.current) return;
    saving.current = true;
    try {
      createProjectLibrary(window.localStorage).insert(candidate);
      savedRef.current = true;
      setSaved(true);
      setError("");
      setNotice(
        "Candidate saved as a new project. The open project was not changed.",
      );
    } catch (reason) {
      setError(
        "Could not save candidate. " +
          (reason instanceof Error ? reason.message : "Storage unavailable."),
      );
    } finally {
      saving.current = false;
    }
  }
  function close() {
    if (
      candidate &&
      !saved &&
      !window.confirm("Discard the unsaved candidate and close the generator?")
    )
      return;
    cancel();
    onClose();
  }
  return (
    <section
      className="project-manager website-generator"
      aria-label="Website generator"
      data-generation-state={generationState}
      data-generation-block-count={candidate?.blocks.length}
      data-generation-request-id={receipt?.requestId}
    >
      <div className="generator-topline">
        <span>
          <StudioIcon name="sparkles" /> BUAT PROYEK BARU
        </span>
        <button className="secondary" onClick={close}>
          Close generator
        </button>
      </div>
      <header className="generator-hero">
        <span className="generator-eyebrow">
          <StudioIcon name="sparkles" /> Eksplorasi ide proyek
        </span>
        <h2>Apa yang ingin Anda buat hari ini?</h2>
        <p>
          Mulai dari sebuah ide. Susun website Anda, tinjau hasilnya, lalu
          sempurnakan di studio.
        </p>
      </header>
      <ol className="generator-workflow" aria-label="Project creation workflow">
        <li aria-current={!candidate ? "step" : undefined}>
          <span>{candidate ? "✓" : "1"}</span>Ide & kebutuhan
        </li>
        <li aria-current={candidate && !saved ? "step" : undefined}>
          <span>{saved ? "✓" : "2"}</span>Review kandidat
        </li>
        <li aria-current={saved ? "step" : undefined}>
          <span>3</span>Simpan & buka
        </li>
      </ol>
      <form
        className="generator-composer"
        onSubmit={(event) => void run(event)}
      >
        <div className="generator-name-field">
          <label htmlFor="website-name">Website name</label>
          <input
            id="website-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
            disabled={busy}
            placeholder="Beri nama untuk ide besar Anda"
          />
        </div>
        <div className="generator-prompt-field">
          <label htmlFor="website-prompt">Website prompt</label>
          <textarea
            ref={promptField}
            id="website-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={GENERATION_LIMITS.promptCharacters}
            required
            rows={4}
            disabled={busy}
            placeholder="Contoh: Website rental mobil di Makassar dengan pengenalan bisnis, informasi armada, layanan, dan kontak pemesanan. Gunakan tampilan modern yang mudah dibaca di ponsel…"
          />
        </div>
        <div className="generator-design-field">
          <label htmlFor="generation-design">Design direction</label>
          <select
            id="generation-design"
            value={designPreference}
            disabled={busy}
            onChange={(event) =>
              setDesignPreference(event.target.value as DesignPreset | "")
            }
          >
            <option value="">AI chooses from my prompt</option>
            {designPresets.map((preset) => (
              <option value={preset.id} key={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
          <p className="manager-help">
            {designPresets.find((preset) => preset.id === designPreference)
              ?.description ??
              "Describe colors, visual mood and layout in your prompt. AI can choose a matching direction; the local template keeps its original style."}{" "}
            Applies to the next candidate.
          </p>
        </div>
        <div className="generator-composer-footer">
          <span className="generator-offline-label">
            <span className="dot" /> Live generation disabled by default
          </span>
          <span className="generator-counter">
            {prompt.length.toLocaleString("id-ID")} /{" "}
            {GENERATION_LIMITS.promptCharacters.toLocaleString("id-ID")}{" "}
            karakter
          </span>
          <button
            className="primary"
            type="submit"
            disabled={busy}
            aria-busy={busy}
          >
            <StudioIcon name="sparkles" />
            Generate candidate
          </button>
          {busy && (
            <button className="secondary" type="button" onClick={cancel}>
              Cancel generation
            </button>
          )}
        </div>
      </form>
      <div className="generator-inspiration" aria-label="Prompt ideas">
        <span>Ide populer</span>
        {(
          [
            {
              label: "Rental mobil",
              name: "Rental Mobil",
              template: "car-rental",
              prompt:
                "Website rental mobil dengan profil bisnis, informasi armada dan layanan, serta kontak untuk pertanyaan sewa. Jangan mengklaim ketersediaan atau menerima pembayaran.",
            },
            {
              label: "Kafe & restoran",
              name: "Kafe Kita",
              template: "coffee-shop",
              prompt:
                "Website kafe yang hangat dan modern. Tampilkan cerita usaha, menu unggulan, jam buka, dan informasi kontak.",
            },
            {
              label: "Portofolio kreatif",
              name: "Portofolio Saya",
              template: "portfolio",
              prompt:
                "Portofolio kreatif minimalis dengan perkenalan diri, karya pilihan, layanan, dan kontak kolaborasi.",
            },
          ] as const
        ).map((idea) => (
          <button
            key={idea.label}
            type="button"
            disabled={busy}
            onClick={() => {
              setPrompt(idea.prompt);
              setTemplate(idea.template);
              if (!name.trim()) setName(idea.name);
              promptField.current?.focus();
            }}
          >
            {idea.label}
            <span aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
      <div className="generator-method-heading">
        <h3>Pilih metode mulai</h3>
        <p>Alur yang sesuai dengan cara Anda bekerja.</p>
      </div>
      <div className="generator-methods">
        <button
          type="button"
          className="generator-method generator-method-ai"
          disabled={busy}
          onClick={() => promptField.current?.focus()}
        >
          <span className="generator-method-tag">PROMPT → WEBSITE</span>
          <span className="generator-method-icon">
            <StudioIcon name="sparkles" />
          </span>
          <strong>Buat dengan AI</strong>
          <p>
            Jelaskan kebutuhan website Anda. Hasil dari backend selalu ditinjau
            sebelum disimpan.
          </p>
          <span className="generator-method-action">
            Tulis ide Anda <span aria-hidden="true">→</span>
          </span>
        </button>
        <div className="generator-method generator-method-template">
          <span className="generator-method-icon">
            <StudioIcon name="layout" />
          </span>
          <strong>Mulai dari template</strong>
          <p>
            Gunakan struktur siap pakai dan sesuaikan isinya. Tersedia secara
            lokal, tanpa AI.
          </p>
          <label htmlFor="fallback-template">Fallback template</label>
          <select
            id="fallback-template"
            value={template}
            onChange={(e) => setTemplate(e.target.value as TemplateId)}
            disabled={busy}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={fallback}
          >
            Use local template fallback <span aria-hidden="true">→</span>
          </button>
        </div>
        <button
          type="button"
          className="generator-method"
          disabled={busy}
          onClick={close}
        >
          <span className="generator-method-icon">
            <StudioIcon name="edit" />
          </span>
          <strong>Lanjutkan di studio</strong>
          <p>
            Kembali ke proyek aktif. Susun komponen dan atur konten langsung di
            canvas visual.
          </p>
          <span className="generator-method-action">
            Buka proyek aktif <span aria-hidden="true">→</span>
          </span>
        </button>
      </div>
      <p className="manager-help">
        Generate a separate candidate, review it, then explicitly save a new
        project. Existing projects are never replaced. Do not submit
        confidential data to a cloud provider.
      </p>
      {busy && (
        <p className="manager-notice" aria-live="polite">
          Generating candidate… Nothing will be auto-saved.
        </p>
      )}
      {receipt && (
        <p
          className="manager-help"
          role="status"
          aria-label="Generation status"
          data-request-id={receipt.requestId}
          data-schema-validation={receipt.schemaValidation}
          data-transport-calls={receipt.transportCalls}
          data-provider-status={receipt.providerStatus}
          data-provider-rpc-status={receipt.providerRpcStatus}
          data-provider-error-category={receipt.providerErrorCategory}
          data-provider-retryable={receipt.providerRetryable}
          data-duration-ms={receipt.durationMs}
          data-diagnostics-origin={receipt.diagnosticsOrigin}
          data-generation-problem={
            receipt.problem ? JSON.stringify(receipt.problem) : undefined
          }
        >
          Generation state: {generationState} · Request: {receipt.requestId} ·
          Started: {receipt.startedAt}
          {receipt.finishedAt ? ` · Finished: ${receipt.finishedAt}` : ""}
          {receipt.durationMs !== undefined
            ? ` · Duration: ${receipt.durationMs} ms`
            : ""}{" "}
          · Schema: {receipt.schemaValidation ?? "not_attempted"} · Transport
          calls: {receipt.transportCalls ?? "unknown"}
          {receipt.providerStatus !== undefined
            ? ` · Provider HTTP: ${receipt.providerStatus}`
            : ""}
          {receipt.providerErrorCategory
            ? ` · Category: ${receipt.providerErrorCategory} · Potentially retryable: ${String(receipt.providerRetryable)} (does not authorize retry)`
            : ""}
          {receipt.problem
            ? ` · Reason: ${receipt.problem.reason} · Stage: ${receipt.problem.stage}${receipt.problem.issues?.length ? " · Fields: " + receipt.problem.issues.map((issue) => issue.path).join(", ") : ""}`
            : ""}
          {receipt.providerRpcStatus
            ? ` · Provider RPC: ${receipt.providerRpcStatus}`
            : ""}
        </p>
      )}
      {error && (
        <p className="manager-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="manager-notice" aria-live="polite">
          {notice}
        </p>
      )}
      {candidate && (
        <section className="generator-review" aria-label="Candidate preview">
          <div className="manager-list-heading">
            <h3>{candidate.name}</h3>
            {candidate.design && (
              <p className="candidate-design-label">
                Design ·{" "}
                {
                  designPresets.find(
                    (preset) => preset.id === candidate.design?.preset,
                  )?.label
                }
              </p>
            )}
            <strong>
              {candidate.generation?.kind === "template"
                ? "Template fallback — not AI"
                : candidate.generation?.mode === "mock"
                  ? "TEST MOCK — not real AI"
                  : "AI-generated candidate · Review required"}
            </strong>
          </div>
          <p className="manager-help">
            Candidate ID: {candidate.id} ·{" "}
            {saved ? "Saved as a new project" : "Not saved"}
          </p>
          <div className="generator-review-summary">
            <div>
              <span>STRUKTUR WEBSITE</span>
              <strong>{candidate.blocks.length} building blocks</strong>
              <p>Konten kandidat telah melewati validasi schema.</p>
            </div>
            <div>
              <span>PENYIMPANAN</span>
              <strong>
                {saved ? "Tersimpan secara lokal" : "Belum disimpan"}
              </strong>
              <p>Simpan sebagai proyek baru untuk melanjutkan di studio.</p>
            </div>
          </div>
          <details className="generator-block-outline">
            <summary>
              Tinjau struktur komponen{" "}
              <span>{candidate.blocks.length} blocks</span>
            </summary>
            <ol>
              {candidate.blocks.map((block, index) => (
                <li key={block.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <StudioIcon name="layout" />
                  <strong>{block.type}</strong>
                </li>
              ))}
            </ol>
          </details>
          {editSession ? (
            <section
              aria-label="Candidate editor"
              className="candidate-editor-host"
            >
              <CandidateEditor
                key={editSession.ticket}
                project={candidate}
                onApply={(next) => {
                  if (
                    epoch.current !== editSession.ticket ||
                    currentContext.current !== editSession.context ||
                    next.id !== editSession.candidateId ||
                    savedRef.current
                  )
                    return;
                  epoch.current += 1;
                  setCandidate(next);
                  setEditSession(null);
                  setError("");
                  setNotice(
                    "Candidate edited locally. Nothing has been saved or replaced.",
                  );
                }}
                onCancel={() => {
                  epoch.current += 1;
                  setEditSession(null);
                }}
              />
            </section>
          ) : (
            <div className="site-page">
              <ProjectRenderer project={candidate} />
            </div>
          )}
          <div className="candidate-actions">
            {!saved && !editSession && (
              <button
                className="secondary"
                onClick={() =>
                  setEditSession({
                    ticket: ++epoch.current,
                    context: currentContext.current,
                    candidateId: candidate.id,
                  })
                }
              >
                Edit candidate before saving
              </button>
            )}
            <button
              className="primary"
              disabled={saved || !!editSession}
              onClick={saveCandidate}
            >
              Save candidate as new project
            </button>
            {saved && (
              <button
                className="secondary"
                onClick={() => {
                  if (onOpen(candidate.id)) onClose();
                }}
              >
                Open candidate in editor
              </button>
            )}
            <button
              className="secondary"
              onClick={() => {
                if (
                  !saved &&
                  !window.confirm("Discard this unsaved candidate?")
                )
                  return;
                epoch.current += 1;
                setEditSession(null);
                setCandidate(null);
                setError("");
                setNotice("");
              }}
            >
              Discard candidate preview
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
