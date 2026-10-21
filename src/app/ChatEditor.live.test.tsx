import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChatEditor } from "./ChatEditor";
import { sampleProject } from "../project-schema/project";
import { OPENROUTER_EDIT_MODEL } from "../ai/edit-source";
import { useProjectWorkspace } from "./use-project-workspace";

const source = {
  provider: "openrouter",
  model: OPENROUTER_EDIT_MODEL,
} as const;
const status = { mode: "live", ...source, sessionToken: "b".repeat(64) };
const result = {
  mode: "live",
  source,
  response: {
    version: 1,
    operations: [
      {
        op: "update",
        blockId: "hero-heading",
        changes: { text: "Selamat Datang" },
      },
    ],
  },
};
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());
const button = (name: string) => screen.getByRole("button", { name });
function setup() {
  const props = {
    project: structuredClone(sampleProject),
    context: "starter:0",
    disabled: false,
    onApply: vi.fn(() => true),
    onClose: vi.fn(),
    onSave: vi.fn(),
    canSave: false,
  };
  const view = render(<ChatEditor {...props} />);
  return { props, ...view };
}
function chooseLive() {
  fireEvent.change(screen.getByRole("combobox", { name: "Editing mode" }), {
    target: { value: "live-http" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Edit request" }), {
    target: { value: "Ubah judul menjadi Selamat Datang." },
  });
}
const consent = () =>
  screen.getByRole("checkbox", { name: /Allow this request/i });

function WorkspaceHarness() {
  const workspace = useProjectWorkspace();
  return (
    <>
      <ChatEditor
        project={workspace.project}
        context={`${workspace.project.id}:${workspace.generation}`}
        getEditVersion={workspace.getEditVersion}
        disabled={workspace.blocked || workspace.invalid}
        onApply={workspace.applyProposal}
        onClose={() => {}}
        onSave={() => workspace.save()}
        canSave={workspace.dirty && !workspace.blocked && !workspace.invalid}
      />
      <p data-testid="current-heading">{workspace.project.blocks[0]?.text}</p>
      <button onClick={workspace.reload}>Reload saved fixture</button>
    </>
  );
}

test("live proposal Apply remains a draft until the panel Save persists and reloads it", async () => {
  history.replaceState(null, "", "/");
  const storageKey = `siteforge:project:v1:${sampleProject.id}`;
  localStorage.setItem(storageKey, JSON.stringify(sampleProject));
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(status))
    .mockResolvedValueOnce(Response.json(result));
  vi.stubGlobal("fetch", transport);
  render(<WorkspaceHarness />);
  chooseLive();
  fireEvent.click(consent());
  fireEvent.click(button("Create AI proposal"));
  await screen.findByRole("region", { name: "Edit proposal" });
  fireEvent.click(button("Preview proposal"));
  expect(JSON.parse(localStorage.getItem(storageKey)!).blocks[0].text).toBe(
    sampleProject.blocks[0].text,
  );
  fireEvent.click(button("Apply proposal"));
  expect(screen.getByTestId("current-heading")).toHaveTextContent(
    "Selamat Datang",
  );
  expect(JSON.parse(localStorage.getItem(storageKey)!).blocks[0].text).toBe(
    sampleProject.blocks[0].text,
  );
  expect(consent()).not.toBeChecked();
  fireEvent.click(button("Save edited project"));
  expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({
    revision: 1,
    blocks: [
      expect.objectContaining({ text: "Selamat Datang" }),
      expect.anything(),
    ],
  });
  fireEvent.click(button("Reload saved fixture"));
  expect(screen.getByTestId("current-heading")).toHaveTextContent(
    "Selamat Datang",
  );
  expect(button("Save edited project")).toBeDisabled();
  expect(transport).toHaveBeenCalledTimes(2);
});

test("live editing requires explicit content consent, Preview and Apply before separate Save", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(status))
    .mockResolvedValueOnce(Response.json(result));
  vi.stubGlobal("fetch", transport);
  const { props, rerender } = setup();
  chooseLive();
  expect(button("Create AI proposal")).toBeDisabled();
  expect(transport).not.toHaveBeenCalled();
  fireEvent.click(consent());
  fireEvent.click(button("Create AI proposal"));
  const proposal = await screen.findByRole("region", { name: "Edit proposal" });
  expect(proposal).toHaveTextContent("AI · openrouter");
  expect(button("Apply proposal")).toBeDisabled();
  expect(props.onApply).not.toHaveBeenCalled();
  expect(props.onSave).not.toHaveBeenCalled();
  fireEvent.click(button("Preview proposal"));
  expect(
    screen.getByRole("region", { name: "After proposal" }),
  ).toHaveTextContent("Selamat Datang");
  fireEvent.click(button("Apply proposal"));
  expect(props.onApply).toHaveBeenCalledWith(
    expect.objectContaining({ mode: "live", source }),
  );
  expect(localStorage.length).toBe(0);
  rerender(<ChatEditor {...props} canSave />);
  fireEvent.click(button("Save edited project"));
  expect(props.onSave).toHaveBeenCalledOnce();
  expect(transport).toHaveBeenCalledTimes(2);
});

test("changing instruction or workspace withdraws live consent", () => {
  const transport = vi.fn();
  vi.stubGlobal("fetch", transport);
  const { props, rerender } = setup();
  chooseLive();
  fireEvent.click(consent());
  fireEvent.change(screen.getByRole("textbox", { name: "Edit request" }), {
    target: { value: "Another request" },
  });
  expect(consent()).not.toBeChecked();
  fireEvent.click(consent());
  rerender(<ChatEditor {...props} context="other:1" />);
  expect(consent()).not.toBeChecked();
  expect(button("Create AI proposal")).toBeDisabled();
  expect(transport).not.toHaveBeenCalled();
});

test.each(["disabled", "refused", "timeout", "unavailable"])(
  "shows an actionable %s state without exposing raw errors",
  async (outcome) => {
    const transport = vi.fn<typeof fetch>();
    if (outcome === "disabled")
      transport.mockResolvedValueOnce(
        Response.json({
          mode: "disabled",
          provider: null,
          sessionToken: status.sessionToken,
        }),
      );
    else if (outcome === "unavailable")
      transport.mockRejectedValueOnce(new Error("PRIVATE-ERROR"));
    else
      transport
        .mockResolvedValueOnce(Response.json(status))
        .mockResolvedValueOnce(
          new Response("PRIVATE-ERROR", {
            status: outcome === "refused" ? 422 : 504,
          }),
        );
    vi.stubGlobal("fetch", transport);
    setup();
    chooseLive();
    fireEvent.click(consent());
    fireEvent.click(button("Create AI proposal"));
    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent("PRIVATE-ERROR");
    expect(alert).toHaveTextContent("Nothing was applied");
    expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
  },
);

test("revoking consent cancels pending work and ignores a late live result", async () => {
  let resolve!: (response: Response) => void;
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(status))
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
  vi.stubGlobal("fetch", transport);
  const { props } = setup();
  chooseLive();
  fireEvent.click(consent());
  fireEvent.click(button("Create AI proposal"));
  await screen.findByRole("button", { name: "Cancel AI request" });
  // Allow the capability response to finish before revoking consent.
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
  fireEvent.click(consent());
  await act(async () => {
    resolve(Response.json(result));
  });
  expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
  expect(props.onApply).not.toHaveBeenCalled();
  expect(button("Create AI proposal")).toBeDisabled();
});
