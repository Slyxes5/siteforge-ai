import { expect, test } from "vitest";
import { assertGroundedContent } from "./generation-grounding";
import { GenerationValidationError } from "./generation-validation";
test.each(["phone", "address"])(
  "requires copied structured contact %s",
  (key) => {
    expect(() =>
      assertGroundedContent(
        [{ type: "contact", [key]: "Private invented value" }],
        input,
      ),
    ).toThrow();
  },
);
test("allows copied contact values, unknown empties and ordinary legacy fixture text", () => {
  expect(() =>
    assertGroundedContent(
      [
        {
          type: "contact",
          email: "hello@example.test",
          phone: "+62 812-3456-7890",
          address: "Jalan Mawar",
        },
        {
          type: "contact",
          email: "",
          phone: "",
          address: "",
          body: "Placeholder: isi kontak",
        },
        {
          id: "block-b123",
          type: "image",
          src: "/image42.svg",
          text: "Mock fixture — replace this placeholder copy.",
        },
      ],
      {
        name: "Demo",
        prompt: "Kontak hello@example.test; +62 812-3456-7890; Jalan Mawar",
      },
    ),
  ).not.toThrow();
});
test.each([
  { type: "paragraph", text: "Email private@example.com" },
  { type: "hero", subtitle: "Telepon +62 812-3456-7890" },
  { type: "features", items: [{ title: "Rp 150.000", description: "Promo" }] },
  {
    type: "features",
    items: [{ title: "Layanan", description: "Diskon 25%" }],
  },
  { type: "section", body: "Sejak 1998" },
  { type: "image", alt: "500 pelanggan" },
  { type: "button", text: "$50" },
  { type: "contact", body: "Biaya EUR 20" },
])(
  "rejects unsupported visible facts including nested feature copy: %j",
  (block) => {
    expect(() => assertGroundedContent([block], input)).toThrow();
  },
);
test("preserves supplied numeric facts while ignoring identifiers, layout and URLs", () => {
  expect(() =>
    assertGroundedContent(
      [
        {
          id: "b999",
          type: "hero",
          text: "Studio 54",
          subtitle: "Sejak 1998, Rp 150.000; diskon 25%",
          ctaHref: "#section42",
        },
        {
          type: "features",
          layout: "grid",
          items: [
            {
              title: "Telepon +62 812-3456-7890",
              description: "hello@example.test",
            },
          ],
        },
      ],
      {
        name: "Studio 54",
        prompt:
          "Sejak 1998, Rp 150.000; diskon 25%; +62 812-3456-7890; hello@example.test",
      },
    ),
  ).not.toThrow();
});
test("accepts a supplied price's numeric value without requiring its currency prefix", () => {
  expect(() =>
    assertGroundedContent([{ type: "paragraph", text: "Harga: 150.000" }], {
      name: "Demo",
      prompt: "Harga Rp 150.000",
    }),
  ).not.toThrow();
});
test.each(["USD 20", "120", "private@other.test"])(
  "does not authorize invented context or partial tokens: %s",
  (text) => {
    expect(() =>
      assertGroundedContent([{ type: "paragraph", text }], {
        name: "Demo",
        prompt: "20 dan 1200; private@example.test",
      }),
    ).toThrow(GenerationValidationError);
  },
);
const input = { name: "Demo", prompt: "Situs usaha" };
test("rejects unsupported contact fields with sanitized semantic diagnostics", () => {
  let caught: unknown;
  try {
    assertGroundedContent(
      [
        {
          type: "contact",
          text: "Kontak",
          email: "private@example.com",
          phone: "",
          address: "",
        },
      ],
      input,
    );
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(GenerationValidationError);
  expect(caught).toMatchObject({
    diagnostic: {
      stage: "content_semantics",
      reason: "UNSUPPORTED_BUSINESS_FACT",
    },
  });
  expect(JSON.stringify(caught)).not.toContain("private@example.com");
});
