import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ResponsivePreview } from "./ResponsivePreview";
import { sampleProject, type Project } from "../project-schema/project";
vi.mock("../styles.css?inline", () => ({ default: "" }));

it("keeps project text in React rendering and prevents external link navigation", () => {
  const hostileText = '<img src=x onerror="alert(1)">';
  render(
    <ResponsivePreview
      project={{
        ...sampleProject,
        blocks: [
          { id: "heading", type: "heading", text: hostileText },
          {
            id: "link",
            type: "button",
            text: "Visit example",
            href: "https://example.com/",
          },
        ],
      }}
    />,
  );
  const frame = screen.getByTitle<HTMLIFrameElement>("Website device preview");
  fireEvent.load(frame);
  const body = frame.contentDocument!.body;
  expect(within(body).getByRole("heading")).toHaveTextContent(hostileText);
  expect(body.querySelector("img,script")).toBeNull();
  expect(frame.srcdoc).not.toContain(hostileText);
  expect(frame).toHaveAttribute("sandbox", "allow-same-origin");
  expect(fireEvent.click(within(body).getByRole("link"))).toBe(false);
});

it("updates the canonical preview without replacing its viewport or mutating the supplied document", () => {
  const initial = structuredClone(sampleProject);
  const { rerender } = render(<ResponsivePreview project={initial} />);
  const frame = screen.getByTitle<HTMLIFrameElement>("Website device preview");
  fireEvent.load(frame);
  fireEvent.click(screen.getByRole("button", { name: "Mobile" }));
  const next: Project = {
    ...initial,
    blocks: [{ id: "new-heading", type: "heading", text: "Updated draft" }],
  };
  rerender(<ResponsivePreview project={next} />);
  expect(screen.getByTitle("Website device preview")).toBe(frame);
  expect(
    within(frame.contentDocument!.body).getByRole("heading"),
  ).toHaveTextContent("Updated draft");
  expect(screen.getByRole("button", { name: "Mobile" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(initial).toEqual(sampleProject);
  expect(next.revision).toBe(initial.revision);
});
