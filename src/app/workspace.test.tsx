import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { App } from "./App";
import { sampleProject } from "../project-schema/project";
describe("M1 save/reload workspace", () => {
  beforeEach(() => localStorage.clear());
  it("saves canonical v1 data and reloads it", () => {
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
    fireEvent.click(screen.getByRole("button", { name: "Save project" }));
    expect(screen.getByRole("status")).toHaveTextContent("All changes saved");
    expect(
      JSON.parse(
        localStorage.getItem("siteforge:project:v1:" + sampleProject.id)!,
      ),
    ).toEqual(sampleProject);
    fireEvent.click(screen.getByRole("button", { name: "Reload project" }));
    expect(screen.getByRole("status")).toHaveTextContent("All changes saved");
  });
  it("reports corrupt storage without overwriting it", () => {
    localStorage.setItem("siteforge:project:v1:" + sampleProject.id, "corrupt");
    render(<App />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load");
    expect(screen.getByRole("button", { name: "Save project" })).toBeDisabled();
    expect(
      localStorage.getItem("siteforge:project:v1:" + sampleProject.id),
    ).toBe("corrupt");
  });
});
