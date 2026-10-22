import { StrictMode } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { sampleProject } from "../project-schema/project";
import { ChatEditor } from "./ChatEditor";
import * as proposalEngine from "../ai/edit-proposal";

beforeEach(() => localStorage.clear());

const button = (name: string) => screen.getByRole("button", { name });
function request(value = 'update hero-heading text "Welcome"') {
  fireEvent.change(screen.getByRole("textbox", { name: "Edit request" }), {
    target: { value },
  });
}
function setup() {
  const project = structuredClone(sampleProject);
  const onApply = vi.fn(() => true);
  const onClose = vi.fn();
  const props = {
    project,
    context: "starter:0",
    disabled: false,
    onApply,
    onClose,
  };
  return {
    ...render(
      <StrictMode>
        <ChatEditor {...props} />
      </StrictMode>,
    ),
    props,
  };
}

test("explains the mock command parser, current IDs and explicit unsaved workflow", () => {
  const { props } = setup();
  const panel = screen.getByRole("region", { name: "Mock AI chat editing" });
  expect(panel).toHaveTextContent(/deterministic mock command parser/i);
  expect(panel).toHaveTextContent(/not AI/i);
  expect(panel).toHaveTextContent("hero-heading (heading)");
  expect(panel).toHaveTextContent("hero-copy (paragraph)");
  expect(panel).toHaveTextContent('update hero-heading text "Welcome"');
  expect(screen.getByRole("textbox", { name: "Edit request" })).toHaveValue("");
  expect(button("Create mock proposal")).toBeDisabled();
  expect(button("Preview proposal")).toBeDisabled();
  expect(button("Apply proposal")).toBeDisabled();
  expect(button("Reject proposal")).toBeDisabled();
  fireEvent.click(button("Close chat editor"));
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(props.onApply).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
});

test("previews using safe before/after renderers and applies only the unsaved proposal", () => {
  const { props } = setup();
  const original = structuredClone(props.project);
  request();
  fireEvent.click(button("Create mock proposal"));
  fireEvent.click(button("Apply proposal"));
  expect(props.onApply).not.toHaveBeenCalled();
  fireEvent.click(button("Preview proposal"));
  expect(
    within(screen.getByRole("region", { name: "Before proposal" })).getByRole(
      "heading",
      { name: original.blocks[0].text },
    ),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "After proposal" })).getByRole(
      "heading",
      { name: "Welcome" },
    ),
  ).toBeInTheDocument();
  expect(button("Apply proposal")).not.toBeDisabled();
  fireEvent.click(button("Apply proposal"));
  expect(props.onApply).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      version: 1,
      mode: "mock",
      projectId: original.id,
      baseRevision: original.revision,
      request: 'update hero-heading text "Welcome"',
    }),
  );
  expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
  expect(screen.queryByRole("region", { name: "After proposal" })).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent(
    /applied to (the )?unsaved draft/i,
  );
  expect(props.project).toEqual(original);
  expect(localStorage.length).toBe(0);
});

test("single-block edits show only the changed row and keep actions before the diff", () => {
  setup();
  request();
  fireEvent.click(button("Create mock proposal"));
  const table = screen.getByRole("table", { name: /Operations diff/ });
  expect(within(table).getAllByRole("row")).toHaveLength(2);
  expect(table).toHaveTextContent("hero-heading");
  expect(table).not.toHaveTextContent("hero-copy");
  expect(
    screen.getByRole("region", { name: "Edit proposal" }),
  ).toHaveTextContent("1 affected block");
  const actions = screen.getByRole("group", { name: "Proposal actions" });
  expect(
    actions.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test("rejects a proposal and preview without mutating or persisting the project", () => {
  const { props } = setup();
  const original = structuredClone(props.project);
  request();
  fireEvent.click(button("Create mock proposal"));
  fireEvent.click(button("Preview proposal"));
  fireEvent.click(button("Reject proposal"));
  expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
  expect(screen.queryByRole("region", { name: "After proposal" })).toBeNull();
  expect(button("Apply proposal")).toBeDisabled();
  expect(props.onApply).not.toHaveBeenCalled();
  expect(props.project).toEqual(original);
  expect(localStorage.length).toBe(0);
});

test.each(["snapshot", "revision", "identity", "context", "disabled"])(
  "permanently invalidates a preview after a %s transition, even if restored",
  (transition) => {
    const { props, rerender } = setup();
    request();
    fireEvent.click(button("Create mock proposal"));
    fireEvent.click(button("Preview proposal"));
    const changed = structuredClone(props.project);
    if (transition === "snapshot") changed.blocks[0].text = "Manual edit";
    if (transition === "revision") changed.revision++;
    if (transition === "identity") changed.id = "different-project";
    rerender(
      <StrictMode>
        <ChatEditor
          {...props}
          project={changed}
          context={transition === "context" ? "new:1" : props.context}
          disabled={transition === "disabled"}
        />
      </StrictMode>,
    );
    expect(button("Apply proposal")).toBeDisabled();
    rerender(
      <StrictMode>
        <ChatEditor {...props} />
      </StrictMode>,
    );
    expect(button("Apply proposal")).toBeDisabled();
    expect(button("Preview proposal")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /changed|invalid|stale/i,
    );
    expect(screen.queryByRole("region", { name: "After proposal" })).toBeNull();
    fireEvent.click(button("Apply proposal"));
    expect(props.onApply).not.toHaveBeenCalled();
    fireEvent.click(button("Create mock proposal"));
    fireEvent.click(button("Preview proposal"));
    expect(button("Apply proposal")).not.toBeDisabled();
  },
);

test("retains the proposal and reports an error when the parent refuses apply", () => {
  const { props } = setup();
  props.onApply.mockReturnValue(false);
  request();
  fireEvent.click(button("Create mock proposal"));
  fireEvent.click(button("Preview proposal"));
  fireEvent.click(button("Apply proposal"));
  expect(props.onApply).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert")).toHaveTextContent(
    /not applied|could not apply/i,
  );
  expect(
    screen.getByRole("region", { name: "Edit proposal" }),
  ).toBeInTheDocument();
  expect(localStorage.length).toBe(0);
});

test.each([
  "please make it nicer",
  'update missing text "Hello"',
  "update hero-heading text null",
  'add button after start {"text":"Bad","href":"javascript:alert(1)"}',
])("reports invalid commands without changing the draft: %s", (command) => {
  const { props } = setup();
  const original = structuredClone(props.project);
  request(command);
  fireEvent.click(button("Create mock proposal"));
  expect(screen.getByRole("alert")).toHaveTextContent(/valid mock proposal/i);
  expect(button("Preview proposal")).toBeDisabled();
  expect(button("Apply proposal")).toBeDisabled();
  expect(props.onApply).not.toHaveBeenCalled();
  expect(props.project).toEqual(original);
  expect(localStorage.length).toBe(0);
});

test("explains an unknown command target without exposing raw validation payloads", () => {
  setup();
  request('update missing text "Hello"');
  fireEvent.click(button("Create mock proposal"));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Unknown block target: missing",
  );
});

test("clears a preview and candidate when the request changes or a new proposal is created", () => {
  setup();
  request();
  fireEvent.click(button("Create mock proposal"));
  fireEvent.click(button("Preview proposal"));
  request('update hero-heading text "Changed request"');
  expect(button("Apply proposal")).toBeDisabled();
  expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
  expect(screen.queryByRole("region", { name: "After proposal" })).toBeNull();
  fireEvent.click(button("Create mock proposal"));
  fireEvent.click(button("Preview proposal"));
  fireEvent.click(button("Create mock proposal"));
  expect(button("Apply proposal")).toBeDisabled();
  expect(screen.queryByRole("region", { name: "After proposal" })).toBeNull();
});

test("prevents generation, preview and apply while editing is disabled", () => {
  const { props, rerender } = setup();
  request();
  rerender(<ChatEditor {...props} disabled />);
  expect(screen.getByRole("textbox", { name: "Edit request" })).toBeDisabled();
  for (const name of [
    "Create mock proposal",
    "Preview proposal",
    "Apply proposal",
  ]) {
    expect(button(name)).toBeDisabled();
    fireEvent.click(button(name));
  }
  expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
  expect(props.onApply).not.toHaveBeenCalled();
  fireEvent.click(button("Close chat editor"));
  expect(props.onClose).toHaveBeenCalledOnce();
});

test("shows add, remove and reorder operations with before/after IDs and safe text previews", () => {
  const { props } = setup();
  request(
    'add paragraph after start {"text":"<script>not executable</script>"}\nremove hero-copy',
  );
  fireEvent.click(button("Create mock proposal"));
  const proposal = screen.getByRole("region", { name: "Edit proposal" });
  expect(proposal).toHaveTextContent('"add"');
  expect(proposal).toHaveTextContent('"remove"');
  expect(proposal).toHaveTextContent("hero-copy");
  expect(proposal).toHaveTextContent("null");
  fireEvent.click(button("Preview proposal"));
  const after = screen.getByRole("region", { name: "After proposal" });
  expect(
    within(after).getByText("<script>not executable</script>"),
  ).toBeInTheDocument();
  expect(after.querySelector("script")).toBeNull();
  expect(props.project.blocks).toHaveLength(2);
  fireEvent.click(button("Reject proposal"));
  request("reorder hero-copy,hero-heading");
  fireEvent.click(button("Create mock proposal"));
  expect(
    screen.getByRole("region", { name: "Edit proposal" }),
  ).toHaveTextContent("Before order: hero-heading, hero-copy");
  expect(
    screen.getByRole("region", { name: "Edit proposal" }),
  ).toHaveTextContent("After order: hero-copy, hero-heading");
  fireEvent.click(button("Preview proposal"));
  expect(
    screen.getByRole("region", { name: "After proposal" }).textContent,
  ).toMatch(/We turn bold ambitions.*Great ideas deserve/);
  expect(props.onApply).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
});

test("revalidates on preview and never enables apply when validation fails", () => {
  const { props } = setup();
  request();
  fireEvent.click(button("Create mock proposal"));
  const validate = vi
    .spyOn(proposalEngine, "previewEditProposal")
    .mockImplementationOnce(() => {
      throw new Error("Invalidated proposal");
    });
  try {
    fireEvent.click(button("Preview proposal"));
    expect(validate).toHaveBeenCalledExactlyOnceWith(
      props.project,
      expect.objectContaining({ mode: "mock" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /preview is no longer valid/i,
    );
    expect(button("Apply proposal")).toBeDisabled();
    expect(screen.queryByRole("region", { name: "After proposal" })).toBeNull();
    expect(props.onApply).not.toHaveBeenCalled();
  } finally {
    validate.mockRestore();
  }
});

test("creates a structured proposal before allowing preview or apply", () => {
  const { props } = setup();
  const before = structuredClone(props.project);
  request();
  fireEvent.click(button("Create mock proposal"));
  const proposal = screen.getByRole("region", { name: "Edit proposal" });
  expect(proposal).toHaveTextContent("hero-heading");
  expect(proposal).toHaveTextContent("update");
  expect(proposal).toHaveTextContent("Great ideas deserve a place to grow.");
  expect(proposal).toHaveTextContent("Welcome");
  expect(proposal).toHaveTextContent(/before/i);
  expect(proposal).toHaveTextContent(/after/i);
  expect(button("Preview proposal")).not.toBeDisabled();
  expect(button("Apply proposal")).toBeDisabled();
  expect(screen.queryByRole("region", { name: "After proposal" })).toBeNull();
  expect(props.onApply).not.toHaveBeenCalled();
  expect(props.project).toEqual(before);
  expect(localStorage.length).toBe(0);
});
