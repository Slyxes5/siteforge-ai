import { StrictMode } from "react";
import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CandidateEditor } from "./CandidateEditor";
import { sampleProject } from "../project-schema/project";
import { toPuckData } from "../editor/project-adapter";
vi.mock("../editor/VisualEditor", () => ({
  default: ({
    onSave,
    project,
  }: {
    onSave: (data: unknown) => void;
    project: typeof sampleProject;
  }) => (
    <button onClick={() => onSave(toPuckData(project))}>
      Apply test edits
    </button>
  ),
}));
test("candidate edits can apply under React StrictMode without persisting", async () => {
  const apply = vi.fn();
  render(
    <StrictMode>
      <CandidateEditor
        project={sampleProject}
        onApply={apply}
        onCancel={() => {}}
      />
    </StrictMode>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Apply test edits" }),
  );
  expect(apply).toHaveBeenCalledExactlyOnceWith(sampleProject);
  expect(localStorage.length).toBe(0);
});
