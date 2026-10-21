import { describe, it, expect } from "vitest";
import { projectSchema, sampleProject } from "../project-schema/project";
import { toPuckData, fromPuckData } from "./project-adapter";
const full = projectSchema.parse({
  ...sampleProject,
  blocks: [
    ...sampleProject.blocks,
    { id: "b", type: "button", text: "Contact", href: "#contact" },
    {
      id: "i",
      type: "image",
      text: "Caption",
      src: "/sample-landscape.svg",
      alt: "Landscape",
    },
    {
      id: "hero",
      type: "hero",
      text: "Hero title",
      subtitle: "Description",
      ctaText: "Explore",
      ctaHref: "#about",
    },
    {
      id: "s",
      type: "section",
      text: "About us",
      body: "Section body",
      tone: "sage",
    },
  ],
});
describe("canonical project adapter", () => {
  it("round trips every supported property, ID, order and metadata without loss", () => {
    expect(fromPuckData(toPuckData(full), full)).toEqual(full);
    expect(fromPuckData(toPuckData(sampleProject), sampleProject)).toEqual(
      sampleProject,
    );
  });
  it("rejects unknown components, properties and nested zones rather than discarding data", () => {
    expect(() =>
      fromPuckData(
        {
          root: { props: {} },
          content: [{ type: "unknown", props: { id: "x", text: "x" } }],
        },
        full,
      ),
    ).toThrow();
    expect(() =>
      fromPuckData(
        {
          root: { props: {} },
          content: [
            { type: "heading", props: { id: "x", text: "x", extra: 42 } },
          ],
        },
        full,
      ),
    ).toThrow();
    expect(() =>
      fromPuckData(
        { root: { props: {} }, content: [], zones: { "x:y": [] } },
        full,
      ),
    ).toThrow();
  });
  it("rejects a reserved type property instead of silently losing it", () => {
    expect(() =>
      fromPuckData(
        {
          root: { props: {} },
          content: [
            {
              type: "heading",
              props: { id: "x", text: "x", type: "paragraph" },
            },
          ],
        },
        full,
      ),
    ).toThrow();
  });
  it("supports edits, reorder, insertion and deletion while retaining identity", () => {
    const input = {
      root: { props: {} },
      content: [
        { type: "paragraph", props: { id: "new", text: "Added" } },
        { type: "heading", props: { id: "hero-heading", text: "Edited" } },
      ],
    };
    const next = fromPuckData(input, full);
    expect(next.blocks.map((b) => b.id)).toEqual(["new", "hero-heading"]);
    expect(next.blocks[1].text).toBe("Edited");
    expect(next.id).toBe(full.id);
    expect(next.revision).toBe(full.revision);
    expect(next.name).toBe(full.name);
  });
});
