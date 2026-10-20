import type { Project } from "../project-schema/project";
import type { ChangeSet } from "./changes";
/** Contract only. No provider or simulated generation is implemented in M0.
 * Future credentials must stay in a local server, never in this browser app.
 */
export interface AIProvider {
  readonly id: string;
  proposeChanges(request: {
    prompt: string;
    project: Readonly<Project>;
    signal?: AbortSignal;
  }): Promise<ChangeSet>;
}
