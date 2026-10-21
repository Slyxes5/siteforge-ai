import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ChatEditor } from "./ChatEditor";
import {
  createSyntheticEditProvider,
  type EditProviderRequest,
} from "../ai/structured-edit";
import { sampleProject } from "../project-schema/project";

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const payload = (text = "Welcome") =>
  JSON.stringify({
    version: 1,
    operations: [{ op: "update", blockId: "hero-heading", changes: { text } }],
  });
const button = (name: string) => screen.getByRole("button", { name });
function instruction(text = 'Set the first heading to "Welcome".') {
  fireEvent.change(screen.getByRole("textbox", { name: "Edit request" }), {
    target: { value: text },
  });
}
function setup(
  transport: (
    request: EditProviderRequest,
    signal: AbortSignal,
  ) => Promise<string>,
) {
  const props = {
    project: structuredClone(sampleProject),
    context: "starter:0",
    disabled: false,
    onApply: vi.fn(() => true),
    onClose: vi.fn(),
    syntheticProvider: createSyntheticEditProvider(transport),
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
function syntheticMode() {
  fireEvent.change(screen.getByRole("combobox", { name: "Editing mode" }), {
    target: { value: "synthetic-http" },
  });
}

test("synthetic mock mode is explicit and builds a validated proposal before explicit Preview and Apply", async () => {
  const transport = vi.fn(async () => payload());
  const { props } = setup(transport);
  const before = structuredClone(props.project);
  expect(screen.getByRole("combobox", { name: "Editing mode" })).toHaveValue(
    "deterministic",
  );
  expect(transport).not.toHaveBeenCalled();
  syntheticMode();
  expect(screen.getByText(/named fixture, not live AI/i)).toBeInTheDocument();
  expect(transport).not.toHaveBeenCalled();
  instruction();
  fireEvent.click(button("Create synthetic mock proposal"));
  await screen.findByRole("region", { name: "Edit proposal" });
  expect(transport).toHaveBeenCalledOnce();
  expect(button("Apply proposal")).toBeDisabled();
  expect(props.onApply).not.toHaveBeenCalled();
  expect(props.project).toEqual(before);
  expect(localStorage.length).toBe(0);
  fireEvent.click(button("Preview proposal"));
  expect(button("Apply proposal")).not.toBeDisabled();
  fireEvent.click(button("Apply proposal"));
  expect(props.onApply).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      mode: "mock",
      projectId: before.id,
      baseRevision: before.revision,
    }),
  );
  expect(props.project).toEqual(before);
  expect(localStorage.length).toBe(0);
});

function deferredTransport() {
  let finish!: (raw: string) => void;
  const transport = vi.fn(
    (_request: EditProviderRequest, _signal: AbortSignal) =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  return { transport, finish: (raw = payload()) => finish(raw) };
}

test.each(["snapshot", "revision", "identity", "context", "disabled"])(
  "permanently cancels an in-flight request after a %s transition even when restored",
  async (transition) => {
    const deferred = deferredTransport();
    const { props, rerender } = setup(deferred.transport);
    syntheticMode();
    instruction();
    fireEvent.click(button("Create synthetic mock proposal"));
    await waitFor(() => expect(deferred.transport).toHaveBeenCalledOnce());
    try {
      const changed = structuredClone(props.project);
      if (transition === "snapshot") changed.blocks[0].text = "Manual draft";
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
      rerender(
        <StrictMode>
          <ChatEditor {...props} />
        </StrictMode>,
      );
      expect(deferred.transport.mock.calls[0][1].aborted).toBe(true);
      expect(
        screen.queryByRole("region", { name: "Edit proposal" }),
      ).toBeNull();
    } finally {
      await act(async () => deferred.finish());
    }
    expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
    expect(button("Apply proposal")).toBeDisabled();
    expect(props.onApply).not.toHaveBeenCalled();
  },
);

test.each(["instruction", "mode"])(
  "changing %s permanently invalidates an in-flight result",
  async (transition) => {
    const deferred = deferredTransport();
    const { props } = setup(deferred.transport);
    syntheticMode();
    instruction();
    fireEvent.click(button("Create synthetic mock proposal"));
    await waitFor(() => expect(deferred.transport).toHaveBeenCalledOnce());
    try {
      if (transition === "instruction") {
        instruction("Different instruction");
        instruction();
      } else {
        fireEvent.change(
          screen.getByRole("combobox", { name: "Editing mode" }),
          { target: { value: "deterministic" } },
        );
        syntheticMode();
      }
      expect(deferred.transport.mock.calls[0][1].aborted).toBe(true);
    } finally {
      await act(async () => deferred.finish());
    }
    expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
    expect(props.onApply).not.toHaveBeenCalled();
  },
);

test("pending requests reject duplicate submissions and expose explicit cancellation", async () => {
  const deferred = deferredTransport();
  const { props } = setup(deferred.transport);
  syntheticMode();
  instruction();
  fireEvent.click(button("Create synthetic mock proposal"));
  await waitFor(() => expect(deferred.transport).toHaveBeenCalledOnce());
  try {
    expect(screen.getByRole("status")).toHaveTextContent(
      /requesting synthetic mock/i,
    );
    expect(button("Create synthetic mock proposal")).toBeDisabled();
    fireEvent.click(button("Create synthetic mock proposal"));
    expect(deferred.transport).toHaveBeenCalledOnce();
    fireEvent.click(button("Cancel mock request"));
    expect(deferred.transport.mock.calls[0][1].aborted).toBe(true);
    expect(button("Create synthetic mock proposal")).not.toBeDisabled();
  } finally {
    await act(async () => deferred.finish());
  }
  expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
  expect(props.onApply).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
});

test("unmount cancels a noncooperative pending provider and ignores its late result", async () => {
  const deferred = deferredTransport();
  const { props, unmount } = setup(deferred.transport);
  syntheticMode();
  instruction();
  fireEvent.click(button("Create synthetic mock proposal"));
  await waitFor(() => expect(deferred.transport).toHaveBeenCalledOnce());
  try {
    unmount();
    expect(deferred.transport.mock.calls[0][1].aborted).toBe(true);
  } finally {
    await act(async () => deferred.finish());
  }
  expect(props.onApply).not.toHaveBeenCalled();
});

test("late out-of-order results and cleanup cannot replace or unlock a newer pending request", async () => {
  const finish: Array<(raw: string) => void> = [];
  const transport = vi.fn(
    () => new Promise<string>((resolve) => finish.push(resolve)),
  );
  const { props } = setup(transport);
  syntheticMode();
  instruction("First request");
  fireEvent.click(button("Create synthetic mock proposal"));
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  fireEvent.click(button("Cancel mock request"));
  instruction("Newest request");
  fireEvent.click(button("Create synthetic mock proposal"));
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  await act(async () => finish[0](payload("Old result")));
  expect(button("Create synthetic mock proposal")).toBeDisabled();
  expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
  await act(async () => finish[1](payload("Newest result")));
  expect(
    screen.getByRole("region", { name: "Edit proposal" }),
  ).toHaveTextContent("Newest result");
  expect(
    screen.getByRole("region", { name: "Edit proposal" }),
  ).not.toHaveTextContent("Old result");
  expect(button("Apply proposal")).toBeDisabled();
  expect(props.onApply).not.toHaveBeenCalled();
});

test.each([
  payload("999 clients"),
  JSON.stringify({
    version: 1,
    operations: [{ op: "remove", blockId: "missing" }],
  }),
  JSON.stringify({
    version: 1,
    operations: [
      {
        op: "add",
        afterId: null,
        block: {
          type: "image",
          text: "",
          alt: "Photo",
          src: "https://invented.example/photo.png",
        },
      },
    ],
  }),
])(
  "synthetic output still passes host grounding and canonical validation (case %#)",
  async (raw) => {
    const { props } = setup(async () => raw);
    syntheticMode();
    instruction();
    fireEvent.click(button("Create synthetic mock proposal"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /valid synthetic mock proposal/i,
    );
    expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
    expect(button("Apply proposal")).toBeDisabled();
    expect(props.project).toEqual(sampleProject);
    expect(localStorage.length).toBe(0);
  },
);

test("synthetic errors are sanitized and deterministic editing remains an explicit option", async () => {
  const transport = vi.fn(async () => {
    throw new Error("PRIVATE-CONTEXT secret-token raw-provider-body");
  });
  const { props } = setup(transport);
  syntheticMode();
  instruction();
  fireEvent.click(button("Create synthetic mock proposal"));
  const alert = await screen.findByRole("alert");
  expect(alert).not.toHaveTextContent(
    /PRIVATE-CONTEXT|secret-token|raw-provider-body/,
  );
  expect(alert).toHaveTextContent(/deterministic commands/i);
  expect(transport).toHaveBeenCalledOnce();
  expect(screen.getByRole("combobox", { name: "Editing mode" })).toHaveValue(
    "synthetic-http",
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Editing mode" }), {
    target: { value: "deterministic" },
  });
  instruction('update hero-heading text "Offline edit"');
  fireEvent.click(button("Create mock proposal"));
  expect(
    screen.getByRole("region", { name: "Edit proposal" }),
  ).toHaveTextContent("Offline edit");
  expect(transport).toHaveBeenCalledOnce();
  expect(props.onApply).not.toHaveBeenCalled();
});

test("Reject discards a synthetic proposal without application or persistence", async () => {
  const { props } = setup(async () => payload());
  syntheticMode();
  instruction();
  fireEvent.click(button("Create synthetic mock proposal"));
  await screen.findByRole("region", { name: "Edit proposal" });
  fireEvent.click(button("Preview proposal"));
  fireEvent.click(button("Reject proposal"));
  expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
  expect(button("Apply proposal")).toBeDisabled();
  expect(props.onApply).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
});

test("Close aborts pending work before calling the parent", async () => {
  const deferred = deferredTransport();
  const { props } = setup(deferred.transport);
  syntheticMode();
  instruction();
  fireEvent.click(button("Create synthetic mock proposal"));
  await waitFor(() => expect(deferred.transport).toHaveBeenCalledOnce());
  props.onClose.mockImplementation(() => {
    expect(deferred.transport.mock.calls[0][1].aborted).toBe(true);
  });
  fireEvent.click(button("Close chat editor"));
  await act(async () => deferred.finish());
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
});

test("a host-side request timeout is clearly identified without exposing transport details", async () => {
  vi.useFakeTimers();
  const deferred = deferredTransport();
  setup(deferred.transport);
  syntheticMode();
  instruction();
  fireEvent.click(button("Create synthetic mock proposal"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(45_000);
  });
  expect(screen.getByRole("alert")).toHaveTextContent(/timed out/i);
  expect(button("Apply proposal")).toBeDisabled();
  expect(button("Create synthetic mock proposal")).not.toBeDisabled();
  await act(async () => deferred.finish());
});
