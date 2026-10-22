import { lazy, Suspense, useState } from "react";
import { ProjectRenderer } from "../renderer/ProjectRenderer";
import { useProjectWorkspace } from "./use-project-workspace";
import { ProjectManager } from "./ProjectManager";
import { WebsiteGenerator } from "./WebsiteGenerator";
import { ChatEditor } from "./ChatEditor";
import { ResponsivePreview } from "./ResponsivePreview";
import { StudioIcon } from "./StudioIcon";
import "./workspace.css";
const VisualEditor = lazy(() => import("../editor/VisualEditor"));
export function App() {
  const workspace = useProjectWorkspace();
  const [preview, setPreview] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeView, setActiveView] = useState<
    "studio" | "create" | "projects"
  >("studio");
  function openProject(id: string) {
    const opened = workspace.openProject(id);
    if (opened) {
      setPreview(false);
      setActiveView("studio");
    }
    return opened;
  }
  return (
    <div className="workspace m1-workspace studio-workspace">
      <a
        className="studio-skip"
        href={
          activeView === "create"
            ? "#create-project"
            : activeView === "projects"
              ? "#project-library"
              : "#workspace-canvas"
        }
      >
        Skip to content
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <StudioIcon name="sparkles" />
          </span>
          <h1>SiteForge AI</h1>
          <span className="studio-workspace-name">
            <span className="dot" />
            Ruang kerja lokal
          </span>
        </div>
        <nav className="studio-nav" aria-label="Workspace tools">
          <button
            aria-pressed={activeView === "studio"}
            onClick={() => setActiveView("studio")}
          >
            <StudioIcon name="edit" />
            Website studio
          </button>
          <button
            aria-pressed={activeView === "create"}
            onClick={() => {
              setGeneratorOpen(true);
              setActiveView("create");
            }}
          >
            <StudioIcon name="sparkles" />
            Generate website
          </button>
          <button
            aria-pressed={activeView === "projects"}
            onClick={() => {
              setProjectsOpen(true);
              setActiveView("projects");
            }}
          >
            <StudioIcon name="folder" />
            Projects
          </button>
        </nav>
        <span className="studio-prototype-badge">Mode prototipe</span>
      </header>
      <div className="projectbar" hidden={activeView !== "studio"}>
        <div className="studio-project-identity">
          <span className="studio-project-icon">
            <StudioIcon name="folder" />
          </span>
          <strong>{workspace.project.name}</strong>
          <span className="revision">
            Revision {workspace.project.revision}
          </span>
          <span
            role="status"
            className={workspace.dirty ? "save-status dirty" : "save-status"}
          >
            {workspace.dirty ? "● Unsaved changes" : "✓ All changes saved"}
          </span>
        </div>
        <div className="top-actions">
          <button
            className="secondary"
            aria-label="Reload project"
            onClick={workspace.reload}
          >
            <StudioIcon name="reload" />
            Reload
          </button>
          <button
            className="secondary"
            disabled={workspace.invalid}
            onClick={() => setPreview(!preview)}
          >
            <StudioIcon name={preview ? "edit" : "preview"} />
            {preview ? "Back to editor" : "Preview"}
          </button>
          <button
            className="primary"
            aria-label="Save project"
            disabled={
              workspace.blocked || workspace.invalid || !workspace.dirty
            }
            onClick={() => workspace.save()}
          >
            <StudioIcon name="save" />
            Save project
          </button>
        </div>
      </div>
      {workspace.error && (
        <div className="error-banner" role="alert">
          {workspace.error}
        </div>
      )}
      {workspace.notice && (
        <p className="workspace-notice" aria-live="polite">
          {workspace.notice}
        </p>
      )}
      <main className="studio-content">
        <div
          id="project-library"
          tabIndex={-1}
          hidden={activeView !== "projects"}
        >
          {projectsOpen && (
            <ProjectManager
              workspace={workspace}
              onClose={() => {
                setProjectsOpen(false);
                setActiveView("studio");
              }}
              onOpen={openProject}
            />
          )}
        </div>
        <div id="create-project" tabIndex={-1} hidden={activeView !== "create"}>
          {generatorOpen && (
            <WebsiteGenerator
              context={workspace.project.id + ":" + workspace.generation}
              onClose={() => {
                setGeneratorOpen(false);
                setActiveView("studio");
              }}
              onOpen={openProject}
            />
          )}
        </div>
        <div hidden={activeView !== "studio"}>
          <div className="engine-intro">
            <div className="studio-mode-heading">
              <StudioIcon name={preview ? "preview" : "edit"} />
              <h2>{preview ? "Pratinjau responsif" : "Desain visual"}</h2>
              <span className="studio-mode-label">
                {preview ? "DESKTOP / TABLET / MOBILE" : "CANVAS & COMPONENTS"}
              </span>
            </div>
            <span className="studio-canvas-meta">
              {workspace.project.blocks.length} blocks<span>Local draft</span>
            </span>
          </div>
          <div id="workspace-canvas" tabIndex={-1}>
            <div
              hidden={preview}
              className="editor-host"
              aria-label="Visual website editor"
            >
              <Suspense
                fallback={
                  <p className="editor-loading">Loading visual editor…</p>
                }
              >
                <VisualEditor
                  key={workspace.project.id + ":" + workspace.generation}
                  project={workspace.project}
                  onChange={workspace.accept}
                  onSave={workspace.save}
                />
              </Suspense>
            </div>
            {!preview && (
              <details className="live-preview">
                <summary>
                  Live preview <span>Updates from your validated project</span>
                </summary>
                <div className="site-page" aria-label="Live document preview">
                  <ProjectRenderer project={workspace.project} />
                </div>
                {workspace.invalid && (
                  <p>Preview paused until editor data is valid.</p>
                )}
              </details>
            )}
            {preview && <ResponsivePreview project={workspace.project} />}
          </div>
          <section className="studio-assistant" aria-label="Website assistant">
            <button
              className="studio-assistant-toggle"
              aria-label="AI chat editing"
              aria-expanded={chatOpen}
              onClick={() => setChatOpen(!chatOpen)}
            >
              <span className="studio-assistant-title">
                <StudioIcon name="sparkles" />
                <strong>AI chat editing</strong>
              </span>
              <span className="studio-assistant-hint">
                Request → Review → Apply → Save
              </span>
              <span className="studio-assistant-expand" aria-hidden="true">
                {chatOpen ? "−" : "+"}
              </span>
            </button>
            {!chatOpen && (
              <p className="studio-assistant-collapsed">
                Deskripsikan perubahan, tinjau hasilnya, lalu terapkan ke draf.{" "}
                <span>Offline commands available</span>
              </p>
            )}
            {chatOpen && (
              <ChatEditor
                key={workspace.project.id + ":" + workspace.generation}
                project={workspace.project}
                context={
                  workspace.project.id +
                  ":" +
                  workspace.generation +
                  ":" +
                  workspace.editVersion
                }
                getEditVersion={workspace.getEditVersion}
                disabled={workspace.blocked || workspace.invalid}
                onApply={workspace.applyProposal}
                onSave={() => workspace.save()}
                canSave={
                  workspace.dirty && !workspace.blocked && !workspace.invalid
                }
                onClose={() => setChatOpen(false)}
              />
            )}
          </section>
        </div>
      </main>
      <footer className="statusbar">
        <span>
          <span className="dot" /> Local project storage · Explicit save
        </span>
        <span>Live generation disabled by default · Eight building blocks</span>
      </footer>
    </div>
  );
}
