import { projectSchema, type Project } from "./project";
export const MAX_PROJECT_FILE_BYTES = 4 * 1024 * 1024;
export function parseProjectJson(text: string): Project {
  if (new Blob([text]).size > MAX_PROJECT_FILE_BYTES)
    throw new Error("Project file is too large (maximum 4 MiB).");
  return projectSchema.parse(JSON.parse(text));
}
export function exportProjectJson(project: Project): string {
  return JSON.stringify(projectSchema.parse(project), null, 2) + "\n";
}
/** Explicit copy policy: preserve content/metadata, replace ID and start a new revision lineage. */
export function copyProject(project: Project, id: string): Project {
  const valid = projectSchema.parse(project);
  if (id === valid.id)
    throw new Error("A copy requires a different project ID");
  return projectSchema.parse({ ...valid, id, revision: 0 });
}
