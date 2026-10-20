import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { App } from "./App";
import { createProjectLibrary } from "../persistence/project-library";
import { sampleProject } from "../project-schema/project";
describe("project manager UI", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });
  afterEach(() => vi.restoreAllMocks());
  it("creates a clearly labeled template project and opens it in the workspace", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    expect(
      screen.getByText("Template-based generation — not AI"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Neighborhood Coffee" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Coffee for the local community." },
    });
    fireEvent.change(screen.getByLabelText("Starter template"), {
      target: { value: "coffee-shop" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    const created = createProjectLibrary(localStorage).list().projects[0];
    expect(created.name).toBe("Neighborhood Coffee");
    expect(created.description).toBe("Coffee for the local community.");
    expect(created.generation?.templateId).toBe("coffee-shop");
    expect(document.querySelector(".projectbar strong")).toHaveTextContent(
      "Neighborhood Coffee",
    );
  });
  it("renames and requires explicit confirmation before deleting only the chosen project", () => {
    const library = createProjectLibrary(localStorage);
    library.insert(sampleProject);
    library.insert({ ...sampleProject, id: "other", name: "Keep me" });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    const row = screen.getByRole("article", { name: "Project Studio North" });
    fireEvent.click(within(row).getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("New project name"), {
      target: { value: "Renamed studio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rename" }));
    const renamed = screen.getByRole("article", {
      name: "Project Renamed studio",
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(within(renamed).getByRole("button", { name: "Delete" }));
    expect(library.list().projects).toHaveLength(2);
    confirm.mockReturnValue(true);
    fireEvent.click(within(renamed).getByRole("button", { name: "Delete" }));
    expect(library.list().projects.map((p) => p.name)).toEqual(["Keep me"]);
  });
});
