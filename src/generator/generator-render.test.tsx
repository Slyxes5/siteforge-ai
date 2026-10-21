import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { generateProject } from "./templates";
import { ProjectRenderer } from "../renderer/ProjectRenderer";
describe("generated document rendering", () => {
  it("provides real section targets for template CTA anchors", () => {
    const project = generateProject({
      id: "new-project",
      name: "Local shop",
      description: "A local shop.",
      templateId: "coffee-shop",
    });
    const { container } = render(<ProjectRenderer project={project} />);
    const anchors = container.querySelectorAll('a[href^="#"]');
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors)
      expect(
        document.getElementById(anchor.getAttribute("href")!.slice(1)),
      ).not.toBeNull();
  });
});
