import { lazy, Suspense, useState } from "react";
import { ProjectRenderer } from "../renderer/ProjectRenderer";
import { useProjectWorkspace } from "./use-project-workspace";
import { ProjectManager } from "./ProjectManager";
import { WebsiteGenerator } from "./WebsiteGenerator";
import { ChatEditor } from "./ChatEditor";
const VisualEditor = lazy(() => import("../editor/VisualEditor"));
export function App() {
  const workspace = useProjectWorkspace();
  const [preview, setPreview] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  return (
    <div className="workspace m1-workspace">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <h1>SiteForge AI</h1>
          <span className="milestone">M3 · Mock</span>
        </div>
        <div className="top-actions">
          <button
            className="secondary"
            aria-expanded={chatOpen}
            onClick={() => setChatOpen(!chatOpen)}
          >
            AI chat editing
          </button>
          <button
            className="secondary"
            aria-expanded={generatorOpen}
            onClick={() => setGeneratorOpen(true)}
          >
            Generate website
          </button>
          <button
            className="secondary"
            aria-expanded={projectsOpen}
            onClick={() => setProjectsOpen(!projectsOpen)}
          >
            Projects
          </button>
          <button
            className="secondary"
            aria-label="Reload project"
            onClick={workspace.reload}
          >
            Reload
          </button>
          <button
            className="secondary"
            disabled={workspace.invalid}
            onClick={() => setPreview(!preview)}
          >
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
            Save project
          </button>
        </div>
      </header>
      <div className="projectbar">
        <div>
          <span className="breadcrumb">Projects / </span>
          <strong>{workspace.project.name}</strong>
          <span className="revision">
            Revision {workspace.project.revision}
          </span>
        </div>
        <span
          role="status"
          className={workspace.dirty ? "save-status dirty" : "save-status"}
        >
          {workspace.dirty ? "● Unsaved changes" : "✓ All changes saved"}
        </span>
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
      {projectsOpen && (
        <ProjectManager
          workspace={workspace}
          onClose={() => setProjectsOpen(false)}
          onOpen={(id) => {
            const opened = workspace.openProject(id);
            if (opened) setPreview(false);
            return opened;
          }}
        />
      )}
      {generatorOpen && (
        <WebsiteGenerator
          context={workspace.project.id + ":" + workspace.generation}
          onClose={() => setGeneratorOpen(false)}
          onOpen={(id) => {
            const opened = workspace.openProject(id);
            if (opened) setPreview(false);
            return opened;
          }}
        />
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
          onClose={() => setChatOpen(false)}
        />
      )}
      <div className="engine-intro">
        <span>YOUR IDEAS. YOUR CANVAS.</span>
        <p>Shape your next great website.</p>
        <small>Eight building blocks · Local-first · Schema v1</small>
      </div>
      <main>
        <div
          hidden={preview}
          className="editor-host"
          aria-label="Visual website editor"
        >
          <Suspense
            fallback={<p className="editor-loading">Loading visual editor…</p>}
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
        {preview && (
          <section className="preview-stage" aria-label="Website preview">
            <div className="preview-heading">
              <span>LIVE WEBSITE PREVIEW</span>
              <span>{workspace.project.blocks.length} blocks · Schema v1</span>
            </div>
            <div className="site-page">
              <ProjectRenderer project={workspace.project} />
            </div>
            <p className="preview-footnote">
              Your document, rendered directly from the canonical project
              schema.
            </p>
          </section>
        )}
      </main>
      <footer className="statusbar">
        <span>
          <span className="dot" /> Local workspace · No cloud services
        </span>
        <span>Live generation disabled by default · Browser storage only</span>
      </footer>
    </div>
  );
}
