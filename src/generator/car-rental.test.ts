import { describe, expect, it } from "vitest";
import { generateProject, templateIds, templates } from "./templates";
import { fromPuckData, toPuckData } from "../editor/project-adapter";
import { projectSchema } from "../project-schema/project";

describe("car-rental local template", () => {
  it("offers a Car rental choice with a valid deterministic template document", () => {
    expect(templates).toContainEqual({ id: "car-rental", label: "Car rental" });
    expect(templateIds).toContain("car-rental");
    const input = {
      id: "rental-draft",
      name: "My rental draft",
      description: "",
      templateId: "car-rental" as const,
    };
    const project = generateProject(input);
    expect(project.generation).toEqual({
      kind: "template",
      templateId: "car-rental",
      templateVersion: 1,
    });
    expect(project.blocks).toHaveLength(7);
    expect(project.blocks.map((block) => block.type)).toEqual([
      "hero",
      "section",
      "image",
      "heading",
      "paragraph",
      "section",
      "button",
    ]);
    expect(generateProject(input)).toEqual(project);
    expect(projectSchema.parse(project)).toEqual(project);
    expect(fromPuckData(toPuckData(project), project)).toEqual(project);
    expect(new Set(project.blocks.map((block) => block.id)).size).toBe(7);
    expect(project.blocks[0]).toMatchObject({
      text: input.name,
      subtitle: expect.stringMatching(/placeholder/i),
    });
    expect(JSON.stringify(project.blocks)).toMatch(/rental/i);
  });

  it("labels the rental enquiry as non-AI placeholder content without a booking backend", () => {
    const project = generateProject({
      id: "rental",
      name: "Rental draft",
      description: "",
      templateId: "car-rental",
    });
    expect(
      project.blocks.find((block) => block.id === "rental-contact"),
    ).toMatchObject({
      type: "section",
      text: "Rental enquiry · Placeholder",
      body: "Template-generated placeholder, not AI-generated. Add your verified contact details and enquiry instructions here. This page does not check vehicle availability, accept bookings, or process payments.",
      tone: "light",
    });
    for (const block of project.blocks) {
      if (block.type === "button") expect(block.href).toBe("#rental-contact");
      if (block.type === "hero") expect(block.ctaHref).toBe("#rental-contact");
    }
    const content = JSON.stringify(project.blocks);
    expect(content).not.toMatch(/https?:|mailto:|tel:|@|\d|[$€£]/);
  });
});
