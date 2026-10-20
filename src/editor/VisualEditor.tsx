import { useState } from "react";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { puckConfig } from "./puck-config";
import { toPuckData } from "./project-adapter";
import type { Project } from "../project-schema/project";
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
  return (
    <Puck
      config={puckConfig}
      data={data}
      onChange={onChange}
      onPublish={onSave}
      headerTitle={project.name}
      headerPath="/"
      dictionary={{ "header-publish": saveLabel }}
      iframe={{ enabled: false }}
      height={800}
    />
  );
}
