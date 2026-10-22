import { Render } from "@puckeditor/core/rsc";
import type { Project } from "../project-schema/project";
import { puckConfig, toPuckData } from "../editor/puck-config";
import { ProjectDesign } from "./ProjectDesign";
export function ProjectRenderer({ project }: { project: Project }) {
  return (
    <ProjectDesign project={project} design={project.design}>
      <Render config={puckConfig} data={toPuckData(project)} />
    </ProjectDesign>
  );
}
