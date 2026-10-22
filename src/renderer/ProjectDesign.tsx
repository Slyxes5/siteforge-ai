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
  project,
  design,
  children,
}: {
  project?: Pick<Project, "name" | "blocks">;
  design: Project["design"];
  children: ReactNode;
}) {
  if (design === undefined) return children;
  const { preset } = projectDesignSchema.parse(design);
  const profile = profiles[preset];
  const coffee = project?.blocks.some(
    (block) => block.type === "hero" && block.visual === "coffee-editorial",
  );
  const links = project?.blocks
    .filter((block) =>
      ["section", "features", "menu", "gallery", "contact"].includes(
        block.type,
      ),
    )
    .slice(0, 5)
    .map((block) => ({
      id: block.id,
      label: coffee
        ? ((
            {
              menu: "Menu",
              section: "Cerita",
              features: "Pengalaman",
              gallery: "Galeri",
              contact: "Kunjungi",
            } as Record<string, string>
          )[block.type] ?? block.text)
        : block.text,
    }));
  return (
    <div
      className="project-design"
      data-design={preset}
      data-hero={profile.hero}
      data-typography={profile.typography}
      data-density={profile.density}
      data-art-direction={coffee ? "coffee" : undefined}
    >
      {project && links && links.length > 0 && (
        <header className="site-navigation">
          <a className="site-navigation-brand" href="#top">
            {project.name}
          </a>
          <nav aria-label="Main navigation">
            <div className="site-navigation-links">
              {links.map((link) => (
                <a href={"#" + link.id} key={link.id}>
                  {link.label}
                </a>
              ))}
            </div>
            <details className="site-navigation-mobile">
              <summary aria-label="Open navigation">Menu</summary>
              <div className="site-navigation-mobile-links">
                {links.map((link) => (
                  <a href={"#" + link.id} key={link.id}>
                    {link.label}
                  </a>
                ))}
              </div>
            </details>
          </nav>
        </header>
      )}
      {children}
    </div>
  );
}
