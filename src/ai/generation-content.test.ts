import { describe, it, expect } from "vitest";
import {
  buildCandidate,
  generatedContentJsonSchema,
  validateGenerationCandidate,
} from "./generation-content";
import { projectSchema } from "../project-schema/project";
const request = {
  name: "Local Studio",
  prompt: "A website for a local studio.",
};
const provider = { id: "mock" as const, model: "test-fixture" };
const blocks = [
  {
    id: "hero",
    type: "hero",
    text: "Studio",
    subtitle: "Hello",
    ctaText: "Contact",
    ctaHref: "#contact",
  },
  {
    id: "contact",
    type: "section",
    text: "Contact",
    body: "Details here.",
    tone: "sage",
  },
  {
    id: "image",
    type: "image",
    src: "/sample-landscape.svg",
    alt: "Placeholder",
    text: "",
  },
];
describe("generation content boundary", () => {
  it("preserves the provider anyOf contract with ten exclusive typed variants and no optional visual wire fields", () => {
    const schema = generatedContentJsonSchema as unknown as {
      properties: {
        blocks: {
          items: {
            anyOf?: Array<{
              properties: Record<string, unknown>;
              required: string[];
              additionalProperties: boolean;
            }>;
          };
        };
      };
    };
    const variants = schema.properties.blocks.items.anyOf;
    expect(variants).toHaveLength(10);
    const expected = [
      "id,type,text",
      "id,type,text",
      "id,type,text,href",
      "id,type,text,alt,src",
      "id,type,text,subtitle,ctaText,ctaHref",
      "id,type,text,body,tone",
      "id,type,text,layout,items",
      "id,type,text,body,email,phone,address,openingHours",
      "id,type,text,items",
      "id,type,text,items",
    ];
    variants!.forEach((variant, index) => {
      expect(variant.required).toEqual(expected[index].split(","));
      expect(Object.keys(variant.properties)).toEqual(variant.required);
      expect(variant.additionalProperties).toBe(false);
      expect(variant.properties.id).toMatchObject({
        description: expect.stringContaining("lowercase"),
      });
      expect(variant.properties.text).toMatchObject({
        description: expect.stringContaining("2000"),
      });
      expect(variant.properties.type).toMatchObject({
        enum: [
          [
            "heading",
            "paragraph",
            "button",
            "image",
            "hero",
            "section",
            "features",
            "contact",
            "menu",
            "gallery",
          ][index],
        ],
      });
    });
    const supported = [
      "type",
      "properties",
      "required",
      "additionalProperties",
      "anyOf",
      "items",
      "minItems",
      "maxItems",
      "enum",
      "description",
    ];
    const inspect = (node: Record<string, unknown>) => {
      for (const key of Object.keys(node)) expect(supported).toContain(key);
      if (node.properties)
        Object.values(
          node.properties as Record<string, Record<string, unknown>>,
        ).forEach(inspect);
      if (node.items) inspect(node.items as Record<string, unknown>);
      if (node.anyOf)
        (node.anyOf as Array<Record<string, unknown>>).forEach(inspect);
    };
    inspect(generatedContentJsonSchema);
  });
  it("uses the same Unicode character limit in generated content and candidate policy", () => {
    const raw = (count: number) =>
      JSON.stringify({
        blocks: [{ id: "title", type: "heading", text: "😀".repeat(count) }],
      });
    const candidate = buildCandidate(raw(2000), request, provider, "fresh");
    expect(() => validateGenerationCandidate(candidate)).not.toThrow();
    expect(() =>
      buildCandidate(raw(2001), request, provider, "fresh"),
    ).toThrow();
  });
  it("reports a safe field path when a required block field is missing", () => {
    try {
      buildCandidate(
        JSON.stringify({
          blocks: [
            {
              id: "title",
              type: "heading",
              "PRIVATE-UNKNOWN-KEY": "PRIVATE-RAW-VALUE",
            },
          ],
        }),
        request,
        provider,
        "fresh",
      );
      expect.fail("expected structured content rejection");
    } catch (error) {
      expect(error).toMatchObject({
        diagnostic: {
          stage: "structured_output",
          reason: "STRUCTURED_CONTENT_REJECTED",
          issues: expect.arrayContaining([
            { code: "invalid_type", path: "blocks[0].text" },
          ]),
        },
      });
      expect(JSON.stringify(error)).not.toMatch(/PRIVATE/);
    }
  });
  it("builds a new canonical candidate with owned IDs and remapped section anchors", () => {
    const candidate = buildCandidate(
      JSON.stringify({ blocks }),
      request,
      provider,
      "new-id",
    );
    expect(projectSchema.parse(candidate)).toEqual(candidate);
    expect(candidate.id).toBe("new-id");
    expect(candidate.revision).toBe(0);
    expect(candidate.generation).toMatchObject({
      kind: "ai",
      provider: "mock",
      mode: "mock",
    });
    expect(candidate.blocks[0]).toMatchObject({
      id: "new-id-b0",
      ctaHref: "#new-id-b1",
    });
  });
  it.each([
    "broken",
    JSON.stringify({ blocks: [{ id: "x", type: "script", text: "x" }] }),
    JSON.stringify({
      blocks: [
        { id: "x", type: "button", text: "x", href: "javascript:alert(1)" },
      ],
    }),
    JSON.stringify({
      blocks: [
        {
          id: "x",
          type: "image",
          text: "",
          alt: "",
          src: "https://tracker.test/a",
        },
      ],
    }),
    JSON.stringify({ blocks, projectId: "existing" }),
    JSON.stringify({ blocks: [...blocks, blocks[0]] }),
    JSON.stringify({
      blocks: [{ id: "x", type: "button", text: "x", href: "#missing" }],
    }),
  ])("rejects malformed, unsupported, unsafe or ambiguous output", (raw) => {
    expect(() => buildCandidate(raw, request, provider, "fresh")).toThrow();
  });
  it("accepts all six variants with the exact required property names", () => {
    const candidate = buildCandidate(
      JSON.stringify({
        blocks: [
          { id: "title", type: "heading", text: "Synthetic" },
          { id: "copy", type: "paragraph", text: "Synthetic copy" },
          { id: "link", type: "button", text: "Contact", href: "#contact" },
          ...blocks,
        ],
      }),
      request,
      provider,
      "fresh",
    );
    expect(candidate.blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "button",
      "hero",
      "section",
      "image",
    ]);
    expect(validateGenerationCandidate(candidate)).toEqual(candidate);
  });
  it("distinguishes canonical rejection from structured content rejection", () => {
    try {
      buildCandidate(
        JSON.stringify({ blocks }),
        request,
        { ...provider, model: "x".repeat(101) },
        "fresh",
      );
      expect.fail("expected canonical rejection");
    } catch (error) {
      expect(error).toMatchObject({
        diagnostic: {
          stage: "canonical_project",
          reason: "CANONICAL_PROJECT_REJECTED",
          issues: [{ code: "too_big", path: "generation.model" }],
        },
      });
    }
  });
  it("rejects excessive blocks and text", () => {
    expect(() =>
      buildCandidate(
        JSON.stringify({
          blocks: Array.from({ length: 13 }, (_, i) => ({
            id: "b" + i,
            type: "heading",
            text: "Hi",
          })),
        }),
        request,
        provider,
        "fresh",
      ),
    ).toThrow();
    expect(() =>
      buildCandidate(
        JSON.stringify({
          blocks: [{ id: "x", type: "heading", text: "x".repeat(2001) }],
        }),
        request,
        provider,
        "fresh",
      ),
    ).toThrow();
  });
});
