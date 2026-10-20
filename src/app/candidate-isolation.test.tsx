import { expect, test, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { WebsiteGenerator } from "./WebsiteGenerator";
import { buildCandidate } from "../ai/generation-content";
import type { Project } from "../project-schema/project";
const callbacks = vi.hoisted(() => ({
  apply: null as null | ((value: Project) => void),
}));
vi.mock("./CandidateEditor", () => ({
  CandidateEditor: ({ onApply }: { onApply: (value: Project) => void }) => {
    callbacks.apply = onApply;
    return <p>Mock isolated editor</p>;
  },
}));
test("switching workspace abandons candidate edit sessions and ignores late callbacks", async () => {
  const input = { name: "Demo", prompt: "Services site" };
  const candidate = buildCandidate(
    JSON.stringify({
      blocks: [{ id: "title", type: "heading", text: "Original candidate" }],
    }),
    input,
    { id: "mock", model: "fixture" },
    "isolated",
  );
  const generate = async () => ({ candidate, mode: "mock" as const });
  const props = { generate, onOpen: () => true, onClose: () => {} };
  const { rerender } = render(<WebsiteGenerator {...props} context="old" />);
  fireEvent.change(screen.getByLabelText("Website name"), {
    target: { value: input.name },
  });
  fireEvent.change(screen.getByLabelText("Website prompt"), {
    target: { value: input.prompt },
  });
  fireEvent.click(screen.getByRole("button", { name: "Generate candidate" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit candidate before saving" }),
  );
  expect(
    screen.getByRole("region", { name: "Candidate editor" }),
  ).toBeInTheDocument();
  const oldApply = callbacks.apply!;
  rerender(<WebsiteGenerator {...props} context="new" />);
  expect(screen.queryByRole("region", { name: "Candidate editor" })).toBeNull();
  act(() =>
    oldApply({
      ...candidate,
      blocks: [
        { id: "isolated-b0", type: "heading", text: "Late leaked content" },
      ],
    }),
  );
  expect(screen.queryByText("Late leaked content")).toBeNull();
  expect(localStorage.length).toBe(0);
});
