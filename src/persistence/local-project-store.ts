import { projectSchema, type Project } from "../project-schema/project";
export const PROJECT_PREFIX = "siteforge:project:v1:";
export const projectKey = (id: string) => PROJECT_PREFIX + id;
export interface ProjectStore {
  load(id: string): Project | null;
  save(project: Project, expectedRevision: number | null): void;
}
/** Storage is injected, avoiding browser globals at module import time.
 * Revision checks are best-effort within a tab, NOT cross-tab transactions.
 * Storage failures propagate; corrupt data is never replaced automatically.
 */
export function createLocalProjectStore(
  storage: Pick<Storage, "getItem" | "setItem">,
): ProjectStore {
  const key = projectKey;
  const load = (id: string): Project | null => {
    const raw = storage.getItem(key(id));
    if (raw === null) return null;
    const project = projectSchema.parse(JSON.parse(raw));
    if (project.id !== id) throw new Error("Stored project ID mismatch");
    return project;
  };
  return {
    load,
    save(project, expectedRevision) {
      const valid = projectSchema.parse(project);
      const current = load(valid.id);
      if ((current?.revision ?? null) !== expectedRevision)
        throw new Error("Revision conflict");
      if (
        valid.revision !==
        (expectedRevision === null ? 0 : expectedRevision + 1)
      )
        throw new Error("Expected next revision");
      storage.setItem(key(valid.id), JSON.stringify(valid));
    },
  };
}
