import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProjectRenderer } from "./ProjectRenderer";
import { Gallery } from "./Gallery";
import { compileWebsitePlan, websitePlanSchema } from "../ai/website-plan";
import { validateGenerationCandidate } from "../ai/generation-content";
import { projectSchema, sampleProject } from "../project-schema/project";
import { toPuckData, fromPuckData } from "../editor/project-adapter";
import { createLocalProjectStore } from "../persistence/local-project-store";
import { ronaPlan, ronaRequest } from "../../scripts/rona-coffee-scenario";

const project = () =>
  compileWebsitePlan(
    JSON.stringify(ronaPlan),
    ronaRequest,
    { id: "mock", model: "synthetic-rona" },
    "rona-test",
  );
test("photo slots and carousel survive compiler, candidate guards, Puck, JSON, Save and reload", () => {
  const candidate = project();
  expect(candidate.blocks.map((b) => b.type)).toEqual([
    "hero",
    "menu",
    "section",
    "features",
    "gallery",
    "contact",
  ]);
  expect(candidate.blocks[0]).toMatchObject({
    visual: "coffee-editorial",
    imageSrc: "/graphics/coffee-hero.svg",
    ctaHref: "#rona-test-b1",
  });
  expect(candidate.blocks[1]).toMatchObject({
    items: expect.arrayContaining([
      {
        title: "Croissant",
        description: expect.any(String),
        price: "",
        imageSrc: "/graphics/coffee-pastry.svg",
        imageAlt: expect.any(String),
      },
    ]),
  });
  expect(validateGenerationCandidate(candidate, ronaRequest)).toEqual(
    candidate,
  );
  expect(fromPuckData(toPuckData(candidate), candidate)).toEqual(candidate);
  const storage = new Map<string, string>();
  const store = createLocalProjectStore({
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => {
      storage.set(k, v);
    },
  });
  expect(storage.size).toBe(0);
  store.save(candidate, null);
  expect(store.load(candidate.id)).toEqual(candidate);
  expect(projectSchema.parse(JSON.parse(JSON.stringify(candidate)))).toEqual(
    candidate,
  );
});
test("new fields are optional: legacy projects and menus keep their shape", () => {
  expect(projectSchema.parse(sampleProject)).toEqual(sampleProject);
  const legacy = {
    ...sampleProject,
    blocks: [
      {
        id: "m",
        type: "menu" as const,
        text: "Menu",
        items: [{ title: "Kopi", description: "", price: "" }],
      },
    ],
  };
  const { container } = render(<ProjectRenderer project={legacy} />);
  expect(container.querySelector(".menu-photo")).toBeNull();
  expect(projectSchema.parse(legacy)).toEqual(legacy);
});
test("renderer provides six replaceable image containers and an actual controlled gallery", () => {
  const { container } = render(<ProjectRenderer project={project()} />);
  expect(container.querySelectorAll(".menu-photo img")).toHaveLength(6);
  expect(container.querySelector(".project-design")).toHaveAttribute(
    "data-art-direction",
    "coffee",
  );
  expect(
    screen.getByRole("region", { name: "Bayangkan suasananya" }),
  ).toHaveAttribute("aria-roledescription", "carousel");
  expect(
    screen.getByRole("button", { name: "Foto sebelumnya" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Foto berikutnya" })).toBeEnabled();
});
test("carousel supports controls, keyboard, scroll feedback and reduced motion", () => {
  const gallery = project().blocks.find((b) => b.type === "gallery")!;
  const { unmount } = render(
    <Gallery text="Galeri" items={gallery.items} layout="carousel" />,
  );
  const viewport = screen.getByRole("region", { name: "Galeri" });
  Object.defineProperty(viewport, "clientWidth", { value: 600 });
  const scrollTo = vi.fn();
  viewport.scrollTo = scrollTo;
  const old = window.matchMedia;
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  try {
    fireEvent.click(screen.getByRole("button", { name: "Foto berikutnya" }));
    expect(scrollTo).toHaveBeenLastCalledWith({
      left: 600,
      behavior: "instant",
    });
    viewport.scrollLeft = 600;
    fireEvent.scroll(viewport);
    expect(
      screen.getByRole("button", { name: "Lihat foto 2" }),
    ).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(viewport, { key: "End" });
    expect(scrollTo).toHaveBeenLastCalledWith({
      left: 1200,
      behavior: "instant",
    });
    viewport.scrollLeft = 1200;
    fireEvent.scroll(viewport);
    expect(
      screen.getByRole("button", { name: "Foto berikutnya" }),
    ).toBeDisabled();
    fireEvent.keyDown(viewport, { key: "Home" });
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "instant" });
  } finally {
    window.matchMedia = old;
    unmount();
  }
});
test("editor uses a visible grid so every carousel image can be edited", () => {
  const gallery = project().blocks.find((b) => b.type === "gallery")!;
  const { container } = render(
    <Gallery text="Galeri" items={gallery.items} layout="carousel" editing />,
  );
  expect(container.querySelectorAll(".gallery-items img")).toHaveLength(3);
  expect(screen.queryByRole("button", { name: "Foto berikutnya" })).toBeNull();
});
test("empty menu image URL keeps the photo slot and safe URL rules remain enforced", () => {
  const candidate = project();
  const menu = candidate.blocks.find((b) => b.type === "menu")!;
  menu.items[0].imageSrc = "";
  const { container } = render(<ProjectRenderer project={candidate} />);
  expect(container.querySelector(".photo-slot")).toHaveTextContent(
    "Tempat foto menu",
  );
  menu.items[0].imageSrc = "javascript:alert(1)";
  expect(projectSchema.safeParse(candidate).success).toBe(false);
});
test("generation cannot smuggle an external image or unsupported numeric claim in new fields", () => {
  const candidate = project();
  const menu = candidate.blocks.find((b) => b.type === "menu")!;
  menu.items[0].imageSrc = "https://example.com/remote.jpg";
  expect(() => validateGenerationCandidate(candidate, ronaRequest)).toThrow();
  menu.items[0].imageSrc = "/graphics/coffee-cup.svg";
  menu.items[0].imageAlt = "Diskon 99%";
  expect(() => validateGenerationCandidate(candidate, ronaRequest)).toThrow();
});
test("new style tokens are rejected on unrelated plan block types", () => {
  const invalid = structuredClone(ronaPlan);
  invalid.blocks[2].style = "coffee-editorial";
  expect(websitePlanSchema.safeParse(invalid).success).toBe(false);
});
