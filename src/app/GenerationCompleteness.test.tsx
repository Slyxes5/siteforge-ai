import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { WebsiteGenerator } from "./WebsiteGenerator";
import { GenerationCompleteness } from "./GenerationCompleteness";
import { buildCandidate } from "../ai/generation-content";
import { compileWebsitePlan } from "../ai/website-plan";
import { projectKey } from "../persistence/local-project-store";
import { ronaPlan, ronaRequest } from "../../scripts/rona-coffee-scenario";

const provider = { id: "mock" as const, model: "standards-fixture" };
beforeEach(() => localStorage.clear());
test("selected standard reaches generation, stays tied to its candidate and allows explicit draft Save", async () => {
  const generate = vi.fn(async (input) => ({
    candidate: buildCandidate(
      JSON.stringify({
        blocks: [{ id: "intro", type: "heading", text: "Konsep awal" }],
      }),
      input,
      provider,
      "standards-draft",
    ),
    mode: "mock" as const,
  }));
  render(
    <WebsiteGenerator
      context="standards"
      onClose={() => {}}
      onOpen={() => true}
      generate={generate}
    />,
  );
  fireEvent.change(screen.getByLabelText("Website name"), {
    target: { value: "Demo" },
  });
  fireEvent.change(screen.getByLabelText("Website prompt"), {
    target: { value: "Website usaha saya" },
  });
  fireEvent.change(screen.getByLabelText("Standar kelengkapan"), {
    target: { value: "cafe-restaurant" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Generate candidate" }));
  const review = await screen.findByRole("region", {
    name: "Pemeriksaan kelengkapan",
  });
  expect(generate.mock.calls[0][0]).toMatchObject({
    completenessProfile: "cafe-restaurant",
  });
  expect(review).toHaveTextContent("0 dari 7");
  expect(review).toHaveTextContent("Belum tersedia — Daftar menu");
  fireEvent.change(screen.getByLabelText("Standar kelengkapan"), {
    target: { value: "portfolio" },
  });
  expect(review).toHaveTextContent("Kafe / restoran");
  expect(localStorage.length).toBe(0);
  fireEvent.click(
    screen.getByRole("button", { name: "Save candidate as new project" }),
  );
  const stored = JSON.parse(
    localStorage.getItem(projectKey("standards-draft"))!,
  );
  expect(stored.blocks).toHaveLength(1);
  expect(stored).not.toHaveProperty("completenessProfile");
  expect(stored).not.toHaveProperty("completenessReview");
});

test("brief suggestions are local and do not trigger generation", () => {
  const generate = vi.fn();
  render(
    <WebsiteGenerator
      context="suggestion"
      onClose={() => {}}
      onOpen={() => true}
      generate={generate}
    />,
  );
  fireEvent.change(screen.getByLabelText("Website prompt"), {
    target: { value: "Website rental mobil" },
  });
  expect(screen.getByText(/Standar berikutnya:/)).toHaveTextContent(
    "Rental mobil",
  );
  expect(generate).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
});

test("local fallback has an honest structural report and no AI call", () => {
  const generate = vi.fn();
  render(
    <WebsiteGenerator
      context="fallback-standard"
      onClose={() => {}}
      onOpen={() => true}
      generate={generate}
    />,
  );
  fireEvent.change(screen.getByLabelText("Website name"), {
    target: { value: "Demo" },
  });
  fireEvent.change(screen.getByLabelText("Website prompt"), {
    target: { value: "Portofolio kreatif" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Use local template fallback" }),
  );
  expect(
    screen.getByRole("region", { name: "Pemeriksaan kelengkapan" }),
  ).toHaveTextContent("Portofolio");
  expect(screen.getByText("Template fallback — not AI")).toBeInTheDocument();
  expect(generate).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
});

test("review updates after local edits without confusing structure with real business data", () => {
  const project = compileWebsitePlan(
    JSON.stringify(ronaPlan),
    ronaRequest,
    provider,
    "review",
  );
  const { rerender } = render(
    <GenerationCompleteness project={project} profile="cafe-restaurant" />,
  );
  const review = screen.getByRole("region", {
    name: "Pemeriksaan kelengkapan",
  });
  expect(review).toHaveTextContent("7 dari 7");
  expect(
    within(review).getByRole("heading", {
      name: "Materi yang perlu dilengkapi",
    }),
  ).toBeInTheDocument();
  const edited = {
    ...project,
    blocks: project.blocks.filter((block) => block.type !== "menu"),
  };
  rerender(
    <GenerationCompleteness project={edited} profile="cafe-restaurant" />,
  );
  expect(review).toHaveTextContent("4 dari 7");
  expect(review).toHaveTextContent("Belum tersedia — Tempat foto");
  expect(review).toHaveTextContent("Belum tersedia — Tombol tindakan");
});
