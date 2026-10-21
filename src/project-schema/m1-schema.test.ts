import { describe, it, expect } from "vitest";
import { projectSchema, sampleProject } from "./project";
export const blocks = [
  { id: "h", type: "heading", text: "Heading" },
  { id: "p", type: "paragraph", text: "Body" },
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
    subtitle: "Hero description",
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
];
describe("additive schema v1", () => {
  it("accepts all six supported blocks without changing legacy documents", () => {
    expect(projectSchema.safeParse({ ...sampleProject, blocks }).success).toBe(
      true,
    );
    expect(projectSchema.parse(sampleProject)).toEqual(sampleProject);
  });
  it("rejects active or protocol-relative URLs", () => {
    for (const href of [
      "javascript:alert(1)",
      "//evil.test",
      "data:text/html,x",
    ])
      expect(
        projectSchema.safeParse({
          ...sampleProject,
          blocks: [{ id: "b", type: "button", text: "x", href }],
        }).success,
      ).toBe(false);
  });
});
