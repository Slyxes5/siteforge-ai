import { useState } from "react";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { puckConfig } from "./puck-config";
import { toPuckData } from "./project-adapter";
import type { Project } from "../project-schema/project";
import { ProjectDesign } from "../renderer/ProjectDesign";
/** Puck data is initial-only. Explicit reload remounts this boundary. */
export default function VisualEditor({
  project,
  onChange,
  onSave,
  saveLabel = "Save",
}: {
  project: Project;
  onChange: (data: unknown) => void;
  onSave: (data: unknown) => void;
  saveLabel?: string;
}) {
  const [data] = useState(() => toPuckData(project));
  const [initialUi] = useState(() => {
    const compact = window.matchMedia("(max-width: 1023px)").matches;
    return {
      leftSideBarVisible: !compact,
      rightSideBarVisible: !compact,
    };
  });
  return (
    <ProjectDesign project={project} design={project.design}>
      <Puck
        config={puckConfig}
        data={data}
        ui={initialUi}
        onChange={onChange}
        onPublish={onSave}
        headerTitle={project.name}
        headerPath="/"
        dictionary={{ "header-publish": saveLabel }}
        iframe={{ enabled: false }}
        height={800}
      />
    </ProjectDesign>
  );
}
