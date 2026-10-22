import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { App } from "./App";
import { ProjectRenderer } from "../renderer/ProjectRenderer";
import { sampleProject } from "../project-schema/project";
vi.mock("../styles.css?inline", () => ({ default: "" }));
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
    expect(screen.getByText("Website studio")).toBeInTheDocument();
    expect(screen.getByText(/Eight building blocks/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save project" })).toBeEnabled();
  });
  it("switches to canonical preview and back", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const frame = screen.getByTitle<HTMLIFrameElement>(
      "Website device preview",
    );
    fireEvent.load(frame);
    expect(
      within(frame.contentDocument!.body).getByRole("heading", {
        name: sampleProject.blocks[0].text,
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to editor" }));
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });
  it("keeps an unsaved template candidate when navigating between studio views", () => {
    render(<App />);
    const storageBefore = { ...localStorage };
    fireEvent.click(screen.getByRole("button", { name: "Generate website" }));
    fireEvent.click(screen.getByRole("button", { name: "Rental mobil" }));
    expect(screen.getByLabelText("Fallback template")).toHaveValue(
      "car-rental",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use local template fallback" }),
    );
    expect(
      screen.getByRole("region", { name: "Candidate preview" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    expect(
      screen.queryByRole("region", { name: "Candidate preview" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate website" }));
    expect(screen.getByLabelText("Website name")).toHaveValue("Rental Mobil");
    expect(
      screen.getByRole("region", { name: "Candidate preview" }),
    ).toHaveTextContent("Not saved");
    fireEvent.click(screen.getByRole("button", { name: "Website studio" }));
    expect(screen.getByRole("button", { name: "Preview" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Generate website" }));
    expect(
      screen.getByRole("button", { name: "Save candidate as new project" }),
    ).toBeEnabled();
    expect({ ...localStorage }).toEqual(storageBefore);
  });
});
