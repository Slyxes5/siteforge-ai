import { useEffect, useRef, useState } from "react";
import {
  generateProject,
  templates,
  type TemplateId,
} from "../generator/templates";
import {
  createProjectLibrary,
  type LibraryListing,
} from "../persistence/project-library";
import {
  copyProject,
  exportProjectJson,
  parseProjectJson,
  MAX_PROJECT_FILE_BYTES,
} from "../project-schema/project-json";
import type { Project } from "../project-schema/project";
import type { useProjectWorkspace } from "./use-project-workspace";
type Workspace = ReturnType<typeof useProjectWorkspace>;
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown storage error";
export function ProjectManager({
  workspace,
  onOpen,
  onClose,
}: {
  workspace: Workspace;
  onOpen: (id: string) => boolean;
  onClose: () => void;
}) {
  const [listing, setListing] = useState<LibraryListing>({
    projects: [],
    issues: [],
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState<TemplateId>("business");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState<Project | null>(null);
  const [asCopy, setAsCopy] = useState(false);
  const [reading, setReading] = useState(false);
  const readToken = useRef(0);
  function refresh() {
    try {
      setListing(createProjectLibrary(window.localStorage).list());
    } catch (error) {
      setError("Could not list projects. " + message(error));
    }
  }
  useEffect(() => {
    refresh();
  }, [workspace.project.id, workspace.project.revision]);
  function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const generated = generateProject({
        id: crypto.randomUUID(),
        name,
        description,
        templateId,
      });
      const created = createProjectLibrary(window.localStorage).insert(
        generated,
      );
      refresh();
      if (onOpen(created.id)) onClose();
      else
        setNotice(
          "Project created and saved. Opening was cancelled or failed; it remains in the list.",
        );
    } catch (error) {
      setError("Could not create project. " + message(error));
      refresh();
    }
  }
  async function chooseFile(file: File | undefined) {
    const token = ++readToken.current;
    setPending(null);
    setError("");
    setNotice("");
    setReading(false);
    if (!file) return;
    if (file.size > MAX_PROJECT_FILE_BYTES) {
      setError("Project file is too large (maximum 4 MiB).");
      return;
    }
    setReading(true);
    try {
      const parsed = parseProjectJson(await file.text());
      if (token === readToken.current) setPending(parsed);
    } catch (error) {
      if (token === readToken.current)
        setError("Could not read project JSON. " + message(error));
    } finally {
      if (token === readToken.current) setReading(false);
    }
  }
  function importProject(event: React.FormEvent) {
    event.preventDefault();
    if (!pending || reading) return;
    setError("");
    setNotice("");
    try {
      const candidate = asCopy
        ? copyProject(pending, crypto.randomUUID())
        : pending;
      const imported = createProjectLibrary(window.localStorage).insert(
        candidate,
      );
      setPending(null);
      refresh();
      if (onOpen(imported.id)) onClose();
      else
        setNotice(
          "Project imported and saved. Opening was cancelled or failed; it remains in the list.",
        );
    } catch (error) {
      setError("Could not import project. " + message(error));
      refresh();
    }
  }
  function exportCurrent() {
    setError("");
    setNotice("");
    let url: string | undefined;
    try {
      const json = exportProjectJson(workspace.project);
      url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download =
        (workspace.project.name.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) ||
          "project") + ".json";
      document.body.append(link);
      link.click();
      link.remove();
      setNotice(
        "JSON download requested. Export does not mark unsaved edits as saved.",
      );
    } catch (error) {
      setError("Could not export project. " + message(error));
    } finally {
      if (url) {
        const downloadUrl = url;
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      }
    }
  }
  function remove(project: Project) {
    const draftWarning =
      workspace.project.id === project.id && workspace.dirty
        ? " Unsaved edits for this project will also be discarded."
        : "";
    if (
      !window.confirm(
        'Delete "' +
          project.name +
          '" permanently from this browser? This cannot be undone.' +
          draftWarning,
      )
    )
      return;
    if (workspace.deleteProject(project)) {
      setNotice("Project deleted.");
      setError("");
      refresh();
    }
  }
  return (
    <section className="project-manager" aria-label="Projects">
      <div className="manager-heading">
        <div>
          <h2>Projects</h2>
          <p>
            <span>Local browser storage · </span>
            <span>Template-based generation — not AI</span>
          </p>
        </div>
        <button className="secondary" onClick={onClose}>
          Close projects
        </button>
      </div>
      {error && (
        <p role="alert" className="manager-error">
          {error}
        </p>
      )}
      {notice && (
        <p className="manager-notice" aria-live="polite">
          {notice}
        </p>
      )}
      <div className="manager-grid">
        <form onSubmit={create}>
          <h3>Create project</h3>
          <label htmlFor="project-name">Project name</label>
          <input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
          />
          <label htmlFor="project-description">Description</label>
          <textarea
            id="project-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            rows={3}
          />
          <label htmlFor="project-template">Starter template</label>
          <select
            id="project-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value as TemplateId)}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
          <p className="manager-help">
            Examples to start from, not a limit on what SiteForge can build. All
            generated copy and images are editable placeholders.
          </p>
          <button className="primary" type="submit">
            Create project
          </button>
        </form>
        <div className="manager-transfer">
          <h3>Import / Export JSON</h3>
          <p className="manager-help">
            Export the current validated draft. Import canonical Schema v1 JSON;
            existing IDs are never replaced.
          </p>
          <button
            className="secondary"
            disabled={workspace.invalid || workspace.blocked}
            onClick={exportCurrent}
          >
            Export current JSON
          </button>
          <form onSubmit={importProject}>
            <label htmlFor="project-file">Project JSON file</label>
            <input
              id="project-file"
              type="file"
              accept=".json,application/json"
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />
            <label className="copy-choice">
              <input
                type="checkbox"
                checked={asCopy}
                onChange={(event) => setAsCopy(event.target.checked)}
              />
              Import as a copy (new ID, revision 0)
            </label>
            {reading && <p>Validating JSON…</p>}
            {pending && (
              <p className="manager-help">
                Ready: {pending.name} · ID {pending.id} · revision{" "}
                {pending.revision}
              </p>
            )}
            <button
              type="submit"
              className="secondary"
              disabled={!pending || reading}
            >
              Import project
            </button>
            <p className="manager-help">
              Maximum import size: 4 MiB. Files are validated before anything is
              written.
            </p>
          </form>
        </div>
      </div>
      <div className="manager-list-heading">
        <h3>Saved projects ({listing.projects.length})</h3>
        <button className="secondary" onClick={refresh}>
          Refresh list
        </button>
      </div>
      {listing.issues.length > 0 && (
        <div className="manager-error">
          <p>
            Some records could not be read. They have not been changed or
            deleted.
          </p>
          <ul>
            {listing.issues.map((issue) => (
              <li key={issue.key}>
                {issue.key}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {listing.projects.length === 0 && (
        <p className="manager-help">
          No saved projects found. Create one above, or save the current draft.
        </p>
      )}
      <div className="project-list">
        {listing.projects.map((project) => (
          <article
            key={project.id}
            aria-label={"Project " + project.name}
            className="project-row"
          >
            <div className="project-row-info">
              <h4>
                {project.name}
                {workspace.project.id === project.id && <span> · Open</span>}
              </h4>
              <p>{project.description || "No description"}</p>
              <small>
                {project.id} · Revision {project.revision}
                {project.generation?.kind === "template"
                  ? " · Template: " + project.generation.templateId
                  : project.generation?.kind === "ai"
                    ? (project.generation.mode === "mock"
                        ? " · TEST MOCK (not real AI)"
                        : " · AI: " + project.generation.provider) +
                      " · " +
                      project.generation.model
                    : ""}
              </small>
            </div>
            <div className="project-row-actions">
              <button
                className="secondary"
                onClick={() => {
                  if (onOpen(project.id)) onClose();
                }}
              >
                Open
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setRenameId(project.id);
                  setNewName(project.name);
                }}
              >
                Rename
              </button>
              <button
                className="secondary danger"
                onClick={() => remove(project)}
              >
                Delete
              </button>
            </div>
            {renameId === project.id && (
              <form
                className="rename-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (workspace.renameProject(project, newName)) {
                    setRenameId(null);
                    refresh();
                  }
                }}
              >
                <label htmlFor={"rename-" + project.id}>New project name</label>
                <input
                  id={"rename-" + project.id}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  required
                  maxLength={200}
                />
                <button className="primary" type="submit">
                  Confirm rename
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setRenameId(null)}
                >
                  Cancel rename
                </button>
              </form>
            )}
          </article>
        ))}
      </div>
      <p className="manager-help">
        Browser storage is not a backup. Export important projects; clearing
        site data removes saved projects. Drafts are never auto-saved.
      </p>
    </section>
  );
}
