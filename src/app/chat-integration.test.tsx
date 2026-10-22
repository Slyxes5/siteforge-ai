import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "./App";
import { sampleProject } from "../project-schema/project";
vi.mock("../styles.css?inline", () => ({ default: "" }));

vi.mock("../editor/VisualEditor", () => ({
  default: () => <div>Visual editor boundary</div>,
}));
const key = "siteforge:project:v1:" + sampleProject.id;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(key, JSON.stringify(sampleProject));
  history.replaceState(null, "", "/");
});
it("chat proposal, preview and rejection cannot mutate the project or storage", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "AI chat editing" }));
  const chat = screen.getByRole("region", { name: "Mock AI chat editing" });
  fireEvent.change(
    within(chat).getByRole("textbox", { name: "Edit request" }),
    {
      target: { value: 'update hero-heading text "A thoughtful new headline"' },
    },
  );
  fireEvent.click(
    within(chat).getByRole("button", { name: "Create mock proposal" }),
  );
  expect(
    within(chat).getByRole("button", { name: "Apply proposal" }),
  ).toBeDisabled();
  fireEvent.click(
    within(chat).getByRole("button", { name: "Preview proposal" }),
  );
  expect(
    within(chat).getByRole("button", { name: "Apply proposal" }),
  ).toBeEnabled();
  expect(localStorage.getItem(key)).toBe(JSON.stringify(sampleProject));
  expect(document.querySelector(".save-status")).toHaveTextContent(
    "All changes saved",
  );
  fireEvent.click(
    within(chat).getByRole("button", { name: "Reject proposal" }),
  );
  expect(localStorage.getItem(key)).toBe(JSON.stringify(sampleProject));
  expect(document.querySelector(".save-status")).toHaveTextContent(
    "All changes saved",
  );
});
it("only Apply changes draft; only explicit Save persists and increments revision", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "AI chat editing" }));
  const chat = screen.getByRole("region", { name: "Mock AI chat editing" });
  fireEvent.change(
    within(chat).getByRole("textbox", { name: "Edit request" }),
    {
      target: { value: 'update hero-heading text "A thoughtful new headline"' },
    },
  );
  fireEvent.click(
    within(chat).getByRole("button", { name: "Create mock proposal" }),
  );
  fireEvent.click(
    within(chat).getByRole("button", { name: "Preview proposal" }),
  );
  fireEvent.click(within(chat).getByRole("button", { name: "Apply proposal" }));
  expect(document.querySelector(".save-status")).toHaveTextContent(
    "Unsaved changes",
  );
  expect(localStorage.getItem(key)).toBe(JSON.stringify(sampleProject));
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  const frame = screen.getByTitle<HTMLIFrameElement>("Website device preview");
  fireEvent.load(frame);
  for (const name of ["Mobile", "Tablet", "Desktop"]) {
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("button", { name })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(localStorage.getItem(key)).toBe(JSON.stringify(sampleProject));
    expect(document.querySelector(".save-status")).toHaveTextContent(
      "Unsaved changes",
    );
  }
  expect(
    within(frame.contentDocument!.body).getByRole("heading", {
      name: "A thoughtful new headline",
    }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save project" }));
  const stored = JSON.parse(localStorage.getItem(key)!);
  expect(stored.revision).toBe(1);
  expect(stored.blocks[0]).toEqual({
    ...sampleProject.blocks[0],
    text: "A thoughtful new headline",
  });
  expect(stored.blocks[1]).toEqual(sampleProject.blocks[1]);
});
