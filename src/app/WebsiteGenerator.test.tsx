import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { GENERATION_LIMITS } from "../ai/website-generation";
import { GenerationFailure } from "../ai/generation-runtime";
import { WebsiteGenerator } from "./WebsiteGenerator";
import { buildCandidate } from "../ai/generation-content";
import { projectKey } from "../persistence/local-project-store";
import type { GenerationResult } from "../ai/website-generation";
const request = { name: "New site", prompt: "A local coffee shop." };
const candidate = buildCandidate(
  JSON.stringify({
    blocks: [{ id: "hero", type: "heading", text: "Mock candidate heading" }],
  }),
  request,
  { id: "mock", model: "test-fixture" },
  "new-candidate-id",
);
function fill() {
  fireEvent.change(screen.getByLabelText("Website name"), {
    target: { value: request.name },
  });
  fireEvent.change(screen.getByLabelText("Website prompt"), {
    target: { value: request.prompt },
  });
}
describe("candidate generation UI", () => {
  it.each([
    "provider_error",
    "validation_error",
    "timeout",
    "cancelled",
  ] as const)(
    "exposes a clear %s terminal state and restores controls",
    async (outcome) => {
      render(
        <WebsiteGenerator
          context="state"
          onClose={() => {}}
          onOpen={() => true}
          generate={async () => {
            throw new GenerationFailure(
              outcome,
              "Safe generation failure. Nothing was saved.",
            );
          }}
        />,
      );
      fill();
      fireEvent.click(
        screen.getByRole("button", { name: "Generate candidate" }),
      );
      await screen.findByRole("alert");
      expect(
        screen.getByRole("region", { name: "Website generator" }),
      ).toHaveAttribute("data-generation-state", outcome);
      expect(
        screen.getByRole("button", { name: "Generate candidate" }),
      ).not.toBeDisabled();
      expect(localStorage.length).toBe(0);
    },
  );
  it("never renders an unknown raw provider exception into the error state", async () => {
    render(
      <WebsiteGenerator
        context="private"
        onClose={() => {}}
        onOpen={() => true}
        generate={async () => {
          throw new Error("PRIVATE-RAW-DIAGNOSTIC");
        }}
      />,
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Generate candidate" }));
    await screen.findByRole("alert");
    expect(screen.queryByText(/PRIVATE-RAW-DIAGNOSTIC/)).toBeNull();
  });
  it("ends loading at its deadline even when generation ignores cancellation forever", async () => {
    vi.useFakeTimers();
    try {
      render(
        <WebsiteGenerator
          context="timeout"
          onClose={() => {}}
          onOpen={() => true}
          generate={() => new Promise(() => {})}
        />,
      );
      fill();
      fireEvent.click(
        screen.getByRole("button", { name: "Generate candidate" }),
      );
      expect(
        screen.getByRole("button", { name: "Generate candidate" }),
      ).toBeDisabled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(GENERATION_LIMITS.totalTimeoutMs + 1);
      });
      expect(
        screen.getByRole("button", { name: "Generate candidate" }),
      ).not.toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent(/timed out/i);
    } finally {
      vi.useRealTimers();
    }
  });
  beforeEach(() => localStorage.clear());
  it("previews clearly labeled mock output without autosaving, then saves only on explicit action", async () => {
    const generate = vi.fn().mockResolvedValue({ candidate, mode: "mock" });
    const onOpen = vi.fn(() => true);
    render(
      <WebsiteGenerator
        context="project-a"
        onClose={() => {}}
        onOpen={onOpen}
        generate={generate}
      />,
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Generate candidate" }));
    await screen.findByRole("heading", { name: "Mock candidate heading" });
    expect(screen.getByText(/TEST MOCK/)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Website generator" }),
    ).toHaveAttribute("data-generation-state", "success");
    expect(localStorage.length).toBe(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Save candidate as new project" }),
    );
    expect(JSON.parse(localStorage.getItem(projectKey(candidate.id))!)).toEqual(
      candidate,
    );
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Open candidate in editor" }),
    );
    expect(onOpen).toHaveBeenCalledWith(candidate.id);
  });
  it("offers deterministic fallback after errors, never presenting it as AI", async () => {
    render(
      <WebsiteGenerator
        context="a"
        onClose={() => {}}
        onOpen={() => true}
        generate={vi.fn().mockRejectedValue(new Error("Provider unavailable"))}
      />,
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Generate candidate" }));
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Use local template fallback" }),
    );
    expect(screen.getByText("Template fallback — not AI")).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
  it("ignores a delayed response after cancellation and after switching context", async () => {
    let finish!: (value: GenerationResult) => void;
    const generate = vi.fn(
      () =>
        new Promise<GenerationResult>((resolve) => {
          finish = resolve;
        }),
    );
    const { rerender } = render(
      <WebsiteGenerator
        context="a"
        onClose={() => {}}
        onOpen={() => true}
        generate={generate}
      />,
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Generate candidate" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel generation" }));
    finish({ candidate, mode: "mock" });
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Mock candidate heading" }),
      ).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate candidate" }));
    rerender(
      <WebsiteGenerator
        context="b"
        onClose={() => {}}
        onOpen={() => true}
        generate={generate}
      />,
    );
    finish({ candidate, mode: "mock" });
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Mock candidate heading" }),
      ).toBeNull(),
    );
    expect(localStorage.length).toBe(0);
  });
  it("never overwrites an occupied ID", async () => {
    localStorage.setItem(projectKey(candidate.id), "existing data");
    render(
      <WebsiteGenerator
        context="a"
        onClose={() => {}}
        onOpen={() => true}
        generate={vi.fn().mockResolvedValue({ candidate, mode: "mock" })}
      />,
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Generate candidate" }));
    await screen.findByRole("heading", { name: "Mock candidate heading" });
    fireEvent.click(
      screen.getByRole("button", { name: "Save candidate as new project" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("already exists");
    expect(localStorage.getItem(projectKey(candidate.id))).toBe(
      "existing data",
    );
  });
});
