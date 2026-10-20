import { projectSchema, type Project } from "../project-schema/project";
import {
  createLocalProjectStore,
  PROJECT_PREFIX,
  projectKey,
} from "./local-project-store";
export type LibraryStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
export type LibraryListing = {
  projects: Project[];
  issues: { key: string; message: string }[];
};
/** Enumerates canonical records directly: no separately written index can orphan a project. */
export function createProjectLibrary(storage: LibraryStorage) {
  const store = createLocalProjectStore(storage);
  function list(): LibraryListing {
    const result: LibraryListing = { projects: [], issues: [] };
    const keys = Array.from({ length: storage.length }, (_, i) =>
      storage.key(i),
    )
      .filter(
        (key): key is string => key !== null && key.startsWith(PROJECT_PREFIX),
      )
      .sort();
    for (const key of keys) {
      try {
        const project = store.load(key.slice(PROJECT_PREFIX.length));
        if (project) result.projects.push(project);
      } catch {
        result.issues.push({
          key,
          message:
            "Invalid or unreadable project record. Preserved without changes.",
        });
      }
    }
    result.projects.sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
    return result;
  }
  function insert(project: Project): Project {
    const valid = projectSchema.parse(project);
    const key = projectKey(valid.id);
    // Check raw presence: a corrupt document is still somebody's data.
    if (storage.getItem(key) !== null)
      throw new Error(
        "Project ID already exists. Import as a copy or choose another ID.",
      );
    const serialized = JSON.stringify(valid);
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized)
      throw new Error("Project creation verification failed");
    return valid;
  }
  function requireSnapshot(expected: Project): Project {
    const valid = projectSchema.parse(expected);
    const actual = store.load(valid.id);
    if (!actual || JSON.stringify(actual) !== JSON.stringify(valid))
      throw new Error(
        "Project snapshot conflict. Refresh the list before retrying.",
      );
    return actual;
  }
  function rename(expected: Project, name: string): Project {
    const current = requireSnapshot(expected);
    const next = projectSchema.parse({
      ...current,
      name: name.trim(),
      revision: current.revision + 1,
    });
    store.save(next, current.revision);
    if (JSON.stringify(store.load(next.id)) !== JSON.stringify(next))
      throw new Error("Rename verification failed");
    return next;
  }
  function remove(expected: Project): void {
    const current = requireSnapshot(expected);
    const key = projectKey(current.id);
    storage.removeItem(key);
    if (storage.getItem(key) !== null)
      throw new Error("Deletion verification failed");
  }
  return { list, insert, rename, remove };
}
