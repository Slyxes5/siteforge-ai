import { expect, test } from "vitest";
import {
  websitePlanSchema,
  websitePlanJsonSchema,
  compileWebsitePlan,
} from "./website-plan";
import { validateGenerationCandidate } from "./generation-content";
import { GenerationValidationError } from "./generation-validation";
import { createLocalProjectStore } from "../persistence/local-project-store";

const request = {
  name: "Studio",
  prompt:
    "Situs bahasa Indonesia. Email halo@example.test, telepon +60123456789, alamat Jalan Mawar. Harga Rp 500.",
};
const provider = { id: "mock" as const, model: "plan-test" };
const compile = (blocks: unknown[]) =>
  compileWebsitePlan(
    JSON.stringify({ blocks }),
    request,
    provider,
    "plan-project",
  );
const allBlocks = () => [
  block("hero", {
    text: "Selamat datang",
    body: "Temukan inspirasi",
    action: "Hubungi kami",
    target: "7",
  }),
  block("heading", { text: "Tentang kami" }),
  block("paragraph", { text: "Karya untuk Anda" }),
  block("button", { text: "Lihat layanan", target: "6" }),
  block("image", { text: "Pemandangan", body: "Bukit hijau" }),
  block("section", { text: "Cerita", body: "Dibuat dengan hati" }),
  block("features", {
    text: "Layanan",
    items: [{ title: "Desain", description: "Pilihan untuk Anda" }],
  }),
  block("contact", {
    text: "Kontak",
    body: "Mari berbincang",
    email: "halo@example.test",
    phone: "+60123456789",
    address: "Jalan Mawar",
  }),
];

const block = (type = "heading", extra: Record<string, unknown> = {}) => ({
  type,
  text: "Judul",
  body: "",
  action: "",
  target: "",
  style: "",
  items: [],
  email: "",
  phone: "",
  address: "",
  ...extra,
});

test("compiles all eight blocks into canonical v1 preserving order, language, content and anchors", () => {
  const project = compile(allBlocks());
  expect(project).toMatchObject({
    schemaVersion: 1,
    id: "plan-project",
    name: request.name,
    description: request.prompt,
    revision: 0,
    generation: {
      kind: "ai",
      mode: "mock",
      provider: "mock",
      model: "plan-test",
    },
  });
  expect(project.blocks).toEqual([
    {
      id: "plan-project-b0",
      type: "hero",
      text: "Selamat datang",
      subtitle: "Temukan inspirasi",
      ctaText: "Hubungi kami",
      ctaHref: "#plan-project-b7",
    },
    { id: "plan-project-b1", type: "heading", text: "Tentang kami" },
    { id: "plan-project-b2", type: "paragraph", text: "Karya untuk Anda" },
    {
      id: "plan-project-b3",
      type: "button",
      text: "Lihat layanan",
      href: "#plan-project-b6",
    },
    {
      id: "plan-project-b4",
      type: "image",
      text: "Pemandangan",
      alt: "Bukit hijau",
      src: "/sample-landscape.svg",
    },
    {
      id: "plan-project-b5",
      type: "section",
      text: "Cerita",
      body: "Dibuat dengan hati",
      tone: "light",
    },
    {
      id: "plan-project-b6",
      type: "features",
      text: "Layanan",
      layout: "grid",
      items: [{ title: "Desain", description: "Pilihan untuk Anda" }],
    },
    {
      id: "plan-project-b7",
      type: "contact",
      text: "Kontak",
      body: "Mari berbincang",
      email: "halo@example.test",
      phone: "+60123456789",
      address: "Jalan Mawar",
    },
  ]);
  expect(validateGenerationCandidate(project, request)).toEqual(project);
});

test("provider projection stays small and uniform with enums and array bounds only", () => {
  expect(websitePlanJsonSchema).toMatchObject({
    type: "object",
    additionalProperties: false,
    required: ["blocks"],
    properties: {
      blocks: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: {
              enum: [
                "heading",
                "paragraph",
                "button",
                "image",
                "hero",
                "section",
                "features",
                "contact",
              ],
            },
            items: { minItems: 0, maxItems: 6 },
          },
        },
      },
    },
  });
  const encoded = JSON.stringify(websitePlanJsonSchema);
  const inspect = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (typeof node.type === "string") {
      for (const key of [
        "minLength",
        "maxLength",
        "description",
        "pattern",
        "anyOf",
        "oneOf",
        "$schema",
        "$defs",
      ])
        expect(node).not.toHaveProperty(key);
    }
    for (const child of Object.values(node)) inspect(child);
  };
  inspect(websitePlanJsonSchema);
  expect(encoded.length).toBeLessThan(2200);
});

test.each([
  ["", "EMPTY_CONTENT"],
  ["  ", "EMPTY_CONTENT"],
  ['{"private-value":', "MALFORMED_CONTENT_JSON"],
  [" ".repeat(131073), "RESPONSE_TOO_LARGE"],
  [
    JSON.stringify({
      blocks: [block("heading", { privateKey: "private-value" })],
    }),
    "STRUCTURED_CONTENT_REJECTED",
  ],
])("sanitizes raw boundary errors (%#)", (raw, reason) => {
  let caught: unknown;
  try {
    compileWebsitePlan(raw, request, provider, "plan-project");
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(GenerationValidationError);
  const error = caught as GenerationValidationError;
  expect(error.diagnostic.reason).toBe(reason);
  expect(JSON.stringify(error.diagnostic)).not.toMatch(
    /private-value|privateKey/,
  );
  expect(error.message).toBe("Generation content failed validation.");
});

test("compiled candidates save and reload unchanged through the existing v1 persistence API", () => {
  const records = new Map<string, string>();
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
  };
  const candidate = compile(allBlocks());
  createLocalProjectStore(storage).save(candidate, null);
  const reloaded = createLocalProjectStore(storage).load(candidate.id);
  expect(reloaded).toEqual(candidate);
  expect(validateGenerationCandidate(reloaded, request)).toEqual(candidate);
});

test("preserves explicit styles, empty links, backward zero index anchors and twelve blocks", () => {
  for (const style of ["light", "sage", "dark"])
    expect(compile([block("section", { style })]).blocks[0]).toMatchObject({
      tone: style,
    });
  for (const style of ["grid", "list"])
    expect(
      compile([
        block("features", { style, items: [{ title: "A", description: "" }] }),
      ]).blocks[0],
    ).toMatchObject({ layout: style });
  const blocks = [
    block("section"),
    block("button", { target: "0" }),
    block("hero"),
    block("image", { text: "" }),
    ...Array.from({ length: 8 }, () => block()),
  ];
  const candidate = compile(blocks);
  expect(candidate.blocks).toHaveLength(12);
  expect(candidate.blocks[1]).toMatchObject({ href: "#plan-project-b0" });
  expect(candidate.blocks[2]).toMatchObject({ ctaHref: "" });
  expect(() => compile([...blocks, block()])).toThrow(
    GenerationValidationError,
  );
});

test.each([
  block("heading", { text: "Harga Rp 999" }),
  block("paragraph", { text: "Diskon 80%" }),
  block("image", { body: "Armada 99" }),
  block("hero", { body: "Sejak 1999" }),
  block("hero", { action: "Bayar USD 999" }),
  block("section", { body: "Pelanggan 999" }),
  block("features", { items: [{ title: "Rp 999", description: "" }] }),
  block("features", {
    items: [{ title: "A", description: "fake@example.test" }],
  }),
  block("contact", { email: "fake@example.test" }),
  block("contact", { phone: "+60999999999" }),
  block("contact", { address: "Jalan Palsu" }),
])("retains output grounding for visible and nested facts (%#)", (entry) => {
  expect(() => compile([entry])).toThrow(GenerationValidationError);
  try {
    compile([entry]);
  } catch (error) {
    expect((error as GenerationValidationError).diagnostic.reason).toBe(
      "UNSUPPORTED_BUSINESS_FACT",
    );
  }
});

test("cannot forge grounding input through plan metadata or candidate description", () => {
  const forged = {
    blocks: [block("contact", { email: "fake@example.test" })],
    description: "fake@example.test",
  };
  expect(() =>
    compileWebsitePlan(
      JSON.stringify(forged),
      request,
      provider,
      "plan-project",
    ),
  ).toThrow(GenerationValidationError);
  const candidate = compile([block("contact")]);
  candidate.description = "fake@example.test";
  const contact = candidate.blocks[0];
  if (contact.type !== "contact") throw new Error("Invalid fixture");
  contact.email = "fake@example.test";
  expect(() => validateGenerationCandidate(candidate, request)).toThrow(
    GenerationValidationError,
  );
  expect(
    compile([
      block("features", {
        items: [{ title: "Rp 500", description: "halo@example.test" }],
      }),
    ]).blocks[0],
  ).toMatchObject({ type: "features" });
});

test("invalid original requests use sanitized validation errors", () => {
  expect(() =>
    compileWebsitePlan(
      JSON.stringify({ blocks: [block()] }),
      { name: "", prompt: "private-value" },
      provider,
      "plan-project",
    ),
  ).toThrow(GenerationValidationError);
});

test("rejects trailing newline in an otherwise valid numeric target", () => {
  expect(
    websitePlanSchema.safeParse({
      blocks: [block("button", { target: "1\n" }), block("section")],
    }).success,
  ).toBe(false);
});

test("strict uniform contract accepts a heading and rejects empty blocks", () => {
  expect(websitePlanSchema.safeParse({ blocks: [block()] }).success).toBe(true);
  expect(websitePlanSchema.safeParse({ blocks: [] }).success).toBe(false);
});

test("contract enforces strict keys, required fields, enums and all size boundaries", () => {
  expect(
    websitePlanSchema.safeParse({
      blocks: Array.from({ length: 12 }, () => block()),
    }).success,
  ).toBe(true);
  const missing: Record<string, unknown> = block();
  delete missing.email;
  const invalid = [
    { blocks: Array.from({ length: 13 }, () => block()) },
    { blocks: [block()], description: "forged" },
    ...[
      missing,
      block("video"),
      block("heading", { id: "forged" }),
      block("heading", { src: "https://example.test" }),
      block("heading", { text: "x".repeat(2001) }),
      block("section", { body: "x".repeat(2001) }),
      block("hero", { action: "x".repeat(2001) }),
      block("button", { target: "1".repeat(43) }),
      block("section", { style: "unknown" }),
      block("contact", { email: "x".repeat(321) }),
      block("contact", { phone: "x".repeat(81) }),
      block("contact", { address: "x".repeat(501) }),
      block("features", {
        items: Array.from({ length: 7 }, () => ({
          title: "A",
          description: "",
        })),
      }),
      block("features", { items: [{ title: "", description: "" }] }),
      block("features", {
        items: [{ title: "x".repeat(81), description: "" }],
      }),
      block("features", {
        items: [{ title: "A", description: "x".repeat(241) }],
      }),
      block("features", {
        items: [{ title: "A", description: "", id: "forged" }],
      }),
    ].map((entry) => ({ blocks: [entry] })),
  ];
  for (const value of invalid)
    expect(websitePlanSchema.safeParse(value).success).toBe(false);
});

test("rejects nonempty fields and styles not used by the block type", () => {
  const allowed: Record<string, string[]> = {
    heading: [],
    paragraph: [],
    button: ["target"],
    image: ["body"],
    hero: ["body", "action", "target"],
    section: ["body", "style"],
    features: ["style", "items"],
    contact: ["body", "email", "phone", "address"],
  };
  for (const [type, fields] of Object.entries(allowed)) {
    const base = block(
      type,
      type === "features" ? { items: [{ title: "A", description: "" }] } : {},
    );
    for (const field of [
      "body",
      "action",
      "target",
      "style",
      "items",
      "email",
      "phone",
      "address",
    ]) {
      if (fields.includes(field)) continue;
      const value =
        field === "items"
          ? [{ title: "A", description: "" }]
          : field === "style"
            ? "light"
            : "x";
      expect(
        websitePlanSchema.safeParse({ blocks: [{ ...base, [field]: value }] })
          .success,
        `${type}.${field}`,
      ).toBe(false);
    }
    if (type !== "image")
      expect(
        websitePlanSchema.safeParse({ blocks: [{ ...base, text: " \n\t" }] })
          .success,
      ).toBe(false);
  }
  for (const entry of [
    block("section", { style: "grid" }),
    block("features", {
      style: "sage",
      items: [{ title: "A", description: "" }],
    }),
    block("features"),
    block("features", { items: [{ title: "  ", description: "" }] }),
  ]) {
    expect(websitePlanSchema.safeParse({ blocks: [entry] }).success).toBe(
      false,
    );
  }
});

test("targets use canonical zero-based decimal indices of anchorable blocks", () => {
  for (const target of [
    "-1",
    "01",
    "+1",
    "1.0",
    " 1",
    "1 ",
    "#b1",
    "https://example.test",
    "2",
    "9007199254740993",
    "0",
  ]) {
    expect(
      websitePlanSchema.safeParse({
        blocks: [block("button", { target }), block("paragraph")],
      }).success,
      target,
    ).toBe(false);
  }
  for (const type of ["section", "features", "contact"]) {
    expect(
      websitePlanSchema.safeParse({
        blocks: [
          block("button", { target: "1" }),
          block(
            type,
            type === "features"
              ? { items: [{ title: "A", description: "" }] }
              : {},
          ),
        ],
      }).success,
    ).toBe(true);
  }
});
