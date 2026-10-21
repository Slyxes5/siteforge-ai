import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ChatEditor } from "./ChatEditor";
import { useProjectWorkspace } from "./use-project-workspace";
import { toPuckData } from "../editor/project-adapter";
import { sampleProject } from "../project-schema/project";
import {
  createSyntheticEditProvider,
  type StructuredEditProvider,
} from "../ai/structured-edit";

const key = "siteforge:project:v1:" + sampleProject.id;
const other = { ...sampleProject, id: "async-other", name: "Other project" };
const otherKey = "siteforge:project:v1:" + other.id;
beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/");
  localStorage.setItem(key, JSON.stringify(sampleProject));
  localStorage.setItem(otherKey, JSON.stringify(other));
});
afterEach(() => vi.restoreAllMocks());
function Harness({ provider }: { provider: StructuredEditProvider }) {
  const workspace = useProjectWorkspace();
  return (
    <>
      <ChatEditor
        project={workspace.project}
        context={workspace.project.id + ":" + workspace.generation}
        disabled={workspace.blocked || workspace.invalid}
        getEditVersion={workspace.getEditVersion}
        onApply={workspace.applyProposal}
        onClose={() => {}}
        syntheticProvider={provider}
      />
      <button
        onClick={() => {
          const initial = workspace.project;
          workspace.accept({});
          workspace.accept(toPuckData(initial));
        }}
      >
        Invalidate and restore
      </button>
      <button
        onClick={() => {
          const initial = workspace.project;
          workspace.accept(
            toPuckData({
              ...initial,
              blocks: initial.blocks.map((block, index) =>
                index ? block : { ...block, text: "Temporary manual edit" },
              ),
            }),
          );
          workspace.accept(toPuckData(initial));
        }}
      >
        Change and restore
      </button>
      <button
        onClick={() =>
          workspace.accept(
            toPuckData({
              ...workspace.project,
              blocks: workspace.project.blocks.map((block, index) =>
                index ? block : { ...block, text: "Manual draft" },
              ),
            }),
          )
        }
      >
        Manual edit
      </button>
      <button onClick={() => workspace.save()}>Save workspace</button>
      <button onClick={() => workspace.openProject(other.id)}>
        Switch workspace
      </button>
      <output aria-label="Current draft">
        {JSON.stringify(workspace.project)}
      </output>
    </>
  );
}
function begin() {
  fireEvent.change(screen.getByRole("combobox", { name: "Editing mode" }), {
    target: { value: "synthetic-http" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Edit request" }), {
    target: { value: 'Set the first heading to "Welcome".' },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Create synthetic mock proposal" }),
  );
}
const raw = JSON.stringify({
  version: 1,
  operations: [
    { op: "update", blockId: "hero-heading", changes: { text: "Welcome" } },
  ],
});

test.each(["Invalidate and restore", "Change and restore"])(
  "an in-flight proposal cannot revive after %s within one workspace batch",
  async (action) => {
    let finish!: (raw: string) => void;
    const transport = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    render(<Harness provider={createSyntheticEditProvider(transport)} />);
    begin();
    await waitFor(() => expect(transport).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: action }));
    await act(async () => finish(raw));
    expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Apply proposal" }),
    ).toBeDisabled();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(sampleProject);
    expect(JSON.parse(localStorage.getItem(otherKey)!)).toEqual(other);
  },
);

test("synthetic proposal review and Apply are read-only for storage until explicit Save", async () => {
  render(<Harness provider={createSyntheticEditProvider(async () => raw)} />);
  const writes = vi.spyOn(Storage.prototype, "setItem");
  begin();
  await screen.findByRole("region", { name: "Edit proposal" });
  expect(screen.getByRole("button", { name: "Apply proposal" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Preview proposal" }));
  fireEvent.click(screen.getByRole("button", { name: "Reject proposal" }));
  expect(writes).not.toHaveBeenCalled();
  begin();
  await screen.findByRole("region", { name: "Edit proposal" });
  fireEvent.click(screen.getByRole("button", { name: "Preview proposal" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply proposal" }));
  expect(writes).not.toHaveBeenCalled();
  expect(
    JSON.parse(screen.getByLabelText("Current draft").textContent!),
  ).toMatchObject({
    revision: 0,
    blocks: [
      { id: "hero-heading", type: "heading", text: "Welcome" },
      sampleProject.blocks[1],
    ],
  });
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(sampleProject);
  fireEvent.click(screen.getByRole("button", { name: "Save workspace" }));
  expect(writes).toHaveBeenCalledOnce();
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({
    revision: 1,
    blocks: [
      { id: "hero-heading", type: "heading", text: "Welcome" },
      sampleProject.blocks[1],
    ],
  });
  expect(JSON.parse(localStorage.getItem(otherKey)!)).toEqual(other);
});

test.each(["Manual edit", "Save workspace", "Switch workspace"])(
  "in-flight %s wins over a delayed synthetic response",
  async (action) => {
    let finish!: (raw: string) => void;
    const transport = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    render(<Harness provider={createSyntheticEditProvider(transport)} />);
    if (action === "Save workspace")
      fireEvent.click(screen.getByRole("button", { name: "Manual edit" }));
    begin();
    await waitFor(() => expect(transport).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: action }));
    await act(async () => finish(raw));
    expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Apply proposal" }),
    ).toBeDisabled();
    const draft = JSON.parse(
      screen.getByLabelText("Current draft").textContent!,
    );
    if (action === "Switch workspace") expect(draft.id).toBe(other.id);
    else expect(draft.blocks[0].text).toBe("Manual draft");
    expect(JSON.parse(localStorage.getItem(otherKey)!)).toEqual(other);
    if (action === "Save workspace")
      expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({
        revision: 1,
        blocks: [
          { ...sampleProject.blocks[0], text: "Manual draft" },
          sampleProject.blocks[1],
        ],
      });
    else expect(JSON.parse(localStorage.getItem(key)!)).toEqual(sampleProject);
  },
);
