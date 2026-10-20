import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { App } from "./App";
import { ProjectRenderer } from "../renderer/ProjectRenderer";
import { sampleProject } from "../project-schema/project";
describe("workspace and safe renderer", () => {
  beforeEach(() => localStorage.clear());
  it("renders HTML-like document content as safe text", () => {
    render(
      <ProjectRenderer
        project={{
          ...sampleProject,
          blocks: [
            { id: "x", type: "heading", text: "<script>alert(1)</script>" },
          ],
        }}
      />,
    );
    expect(screen.getByRole("heading")).toHaveTextContent(
      "<script>alert(1)</script>",
    );
    expect(document.querySelector("script")).toBeNull();
  });
  it("shows the editable workspace with explicit local-only boundaries", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "SiteForge AI" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Live generation disabled by default/),
    ).toBeInTheDocument();
    expect(screen.getByText("M3 · Mock")).toBeInTheDocument();
    expect(screen.getByText(/Eight building blocks/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save project" })).toBeEnabled();
  });
  it("switches to canonical preview and back", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(
      within(screen.getByRole("region", { name: "Website preview" })).getByRole(
        "heading",
        { name: sampleProject.blocks[0].text },
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to editor" }));
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });
});
