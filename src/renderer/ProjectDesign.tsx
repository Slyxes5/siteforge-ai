import type { ReactNode } from "react";
import { projectDesignSchema } from "../project-schema/design";
import type { Project } from "../project-schema/project";

const profiles = {
  "sage-editorial": {
    hero: "editorial",
    typography: "editorial",
    density: "airy",
  },
  "ocean-modern": { hero: "split", typography: "modern", density: "airy" },
  "ember-studio": {
    hero: "centered",
    typography: "editorial",
    density: "airy",
  },
  "midnight-product": {
    hero: "centered",
    typography: "modern",
    density: "compact",
  },
} as const;

/** Presets choose host-owned CSS only; no model-supplied CSS, HTML or font URLs. */
export function ProjectDesign({
  design,
  children,
}: {
  design: Project["design"];
  children: ReactNode;
}) {
  if (design === undefined) return children;
  const { preset } = projectDesignSchema.parse(design);
  const profile = profiles[preset];
  return (
    <div
      className="project-design"
      data-design={preset}
      data-hero={profile.hero}
      data-typography={profile.typography}
      data-density={profile.density}
    >
      {children}
    </div>
  );
}
