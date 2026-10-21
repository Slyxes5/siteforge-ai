import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatEditor } from "./ChatEditor";
import { sampleProject } from "../project-schema/project";

const sessionToken = "a".repeat(64);
const response = {
  mode: "mock",
  response: {
    version: 1,
    operations: [
      { op: "update", blockId: "hero-heading", changes: { text: "Welcome" } },
    ],
  },
};
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const props = {
    project: structuredClone(sampleProject),
    context: "starter:0",
    disabled: false,
    onApply: vi.fn(() => true),
    onClose: vi.fn(),
  };
  render(<ChatEditor {...props} />);
  return props;
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

test("default synthetic mode uses the same-origin session client and preserved proposal boundary", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ mode: "mock", provider: "synthetic", sessionToken }),
    )
    .mockResolvedValueOnce(Response.json(response));
  vi.stubGlobal("fetch", transport);
  const props = setup();
  expect(transport).not.toHaveBeenCalled();
  begin();
  await screen.findByRole("region", { name: "Edit proposal" });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls[0][0]).toBe("/api/edit/status");
  expect(transport.mock.calls[1][0]).toBe("/api/edit/propose");
  expect(transport.mock.calls[1][1]?.headers).toMatchObject({
    "X-SiteForge-Session": sessionToken,
  });
  expect(screen.getByRole("button", { name: "Apply proposal" })).toBeDisabled();
  expect(props.onApply).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
});

test.each(["disabled", "unavailable", "live"])(
  "%s backend produces no actionable proposal or automatic fallback",
  async (mode) => {
    const transport = vi.fn<typeof fetch>();
    if (mode === "unavailable")
      transport.mockRejectedValue(new Error("PRIVATE-CONTEXT secret-token"));
    else
      transport.mockResolvedValueOnce(
        Response.json(
          mode === "disabled"
            ? { mode: "disabled", provider: null, sessionToken }
            : { mode: "live", provider: "openrouter", sessionToken },
        ),
      );
    vi.stubGlobal("fetch", transport);
    const props = setup();
    begin();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/deterministic commands/i);
    expect(alert).not.toHaveTextContent(/PRIVATE-CONTEXT|secret-token/);
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][0]).toBe("/api/edit/status");
    expect(screen.getByRole("combobox", { name: "Editing mode" })).toHaveValue(
      "synthetic-http",
    );
    expect(screen.queryByRole("region", { name: "Edit proposal" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Apply proposal" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Editing mode" }), {
      target: { value: "deterministic" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Edit request" }), {
      target: { value: 'update hero-heading text "Offline edit"' },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create mock proposal" }),
    );
    expect(
      screen.getByRole("region", { name: "Edit proposal" }),
    ).toHaveTextContent("Offline edit");
    expect(transport).toHaveBeenCalledOnce();
    expect(props.onApply).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  },
);

test("backend HTTP timeout is clearly identified and never retried", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ mode: "mock", provider: "synthetic", sessionToken }),
    )
    .mockResolvedValueOnce(new Response("PRIVATE-TIMEOUT", { status: 504 }));
  vi.stubGlobal("fetch", transport);
  setup();
  begin();
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/timed out/i);
  expect(alert).not.toHaveTextContent("PRIVATE-TIMEOUT");
  expect(transport).toHaveBeenCalledTimes(2);
});
