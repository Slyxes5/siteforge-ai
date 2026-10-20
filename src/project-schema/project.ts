import { z } from "zod";

const id = z.string().min(1);
const text = z.string().min(1).max(10000);
const optionalText = z.string().max(10000);
/** No executable schemes, backslashes, protocol-relative or whitespace-obfuscated URLs. */
export const safeUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    if (/[\\\\\s\u0000-\u001f]/.test(value)) return false;
    return (
      value === "" ||
      /^#[^#]*$/.test(value) ||
      /^\/(?!\/)/.test(value) ||
      /^https?:\/\/[^/]+/i.test(value)
    );
  }, "Use an https/http URL, a root-relative path, or an anchor");
export const blockSchema = z.discriminatedUnion("type", [
  z.strictObject({ id, type: z.literal("heading"), text }),
  z.strictObject({ id, type: z.literal("paragraph"), text }),
  z.strictObject({ id, type: z.literal("button"), text, href: safeUrlSchema }),
  z.strictObject({
    id,
    type: z.literal("image"),
    text: optionalText,
    src: safeUrlSchema,
    alt: optionalText,
  }),
  z.strictObject({
    id,
    type: z.literal("hero"),
    text,
    subtitle: optionalText,
    ctaText: optionalText,
    ctaHref: safeUrlSchema,
  }),
  z.strictObject({
    id,
    type: z.literal("section"),
    text,
    body: optionalText,
    tone: z.enum(["light", "sage", "dark"]),
  }),
  z.strictObject({
    id,
    type: z.literal("features"),
    text,
    layout: z.enum(["grid", "list"]),
    items: z
      .array(
        z.strictObject({
          title: z.string().min(1).max(200),
          description: z.string().max(2000),
        }),
      )
      .min(1)
      .max(12),
  }),
  z.strictObject({
    id,
    type: z.literal("contact"),
    text,
    body: optionalText,
    email: z.string().max(320),
    phone: z.string().max(80),
    address: z.string().max(500),
  }),
]);
export const projectSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  generation: z
    .union([
      z.strictObject({
        kind: z.literal("template"),
        templateId: z.string().min(1).max(100),
        templateVersion: z.literal(1),
      }),
      z
        .strictObject({
          kind: z.literal("ai"),
          provider: z.enum(["gemini", "openrouter", "mock"]),
          model: z.string().min(1).max(100),
          promptVersion: z.union([z.literal(1), z.literal(2)]),
          mode: z.enum(["live", "mock"]),
        })
        .refine(
          (value) => (value.provider === "mock") === (value.mode === "mock"),
          "Mock provenance must be explicitly labeled",
        ),
    ])
    .optional(),
  revision: z.number().int().nonnegative(),
  blocks: z
    .array(blockSchema)
    .max(200)
    .refine(
      (blocks) =>
        new Set(blocks.map((block) => block.id)).size === blocks.length,
      "Block IDs must be unique",
    ),
});
type ParsedProject = z.infer<typeof projectSchema>;
// Optional never-fields let legacy template-only readers access absent template metadata safely.
type Provenance =
  | Extract<NonNullable<ParsedProject["generation"]>, { kind: "template" }>
  | (Extract<NonNullable<ParsedProject["generation"]>, { kind: "ai" }> & {
      templateId?: never;
      templateVersion?: never;
    });
export type Project = Omit<ParsedProject, "generation"> & {
  generation?: Provenance;
};
export type Block = z.infer<typeof blockSchema>;
export const sampleProject: Project = {
  schemaVersion: 1,
  id: "siteforge-starter",
  name: "Studio North",
  revision: 0,
  blocks: [
    {
      id: "hero-heading",
      type: "heading",
      text: "Great ideas deserve a place to grow.",
    },
    {
      id: "hero-copy",
      type: "paragraph",
      text: "We turn bold ambitions into thoughtful digital experiences. A small studio, with a bigger perspective.",
    },
  ],
};
