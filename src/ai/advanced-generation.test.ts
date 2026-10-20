import { expect, test } from "vitest";
import {
  buildCandidate,
  validateGenerationCandidate,
} from "./generation-content";
const input = {
  name: "Studio",
  prompt: "A services website with contact details; leave unknown facts empty.",
};
const provider = { id: "mock" as const, model: "test-fixture" };
const content = {
  blocks: [
    {
      id: "intro",
      type: "hero",
      text: "Studio",
      subtitle: "Your introduction",
      ctaText: "Contact",
      ctaHref: "#contact",
    },
    {
      id: "services",
      type: "features",
      text: "Services",
      layout: "grid",
      items: [
        {
          title: "Your offering",
          description: "Add verified service details.",
        },
      ],
    },
    {
      id: "contact",
      type: "contact",
      text: "Contact",
      body: "Add verified contact details.",
      email: "",
      phone: "",
      address: "",
    },
  ],
};
test("M2C enforces grounding at construction and the browser candidate boundary", () => {
  const invented = {
    blocks: [
      {
        id: "contact",
        type: "contact",
        text: "Contact",
        body: "",
        email: "private@example.test",
        phone: "",
        address: "",
      },
    ],
  };
  expect(() =>
    buildCandidate(JSON.stringify(invented), input, provider, "fresh"),
  ).toThrow();
  const valid = buildCandidate(
    JSON.stringify(content),
    input,
    provider,
    "fresh",
  );
  valid.blocks[2] = {
    id: "fresh-b2",
    type: "contact",
    text: "Contact",
    body: "",
    email: "private@example.test",
    phone: "",
    address: "",
  };
  expect(() => validateGenerationCandidate(valid)).toThrow();
});
test("M2C builds versioned rich candidates and remaps Contact and Features anchors", () => {
  const candidate = buildCandidate(
    JSON.stringify(content),
    input,
    provider,
    "fresh",
  );
  expect(candidate.generation).toMatchObject({ promptVersion: 2 });
  expect(candidate.blocks[0]).toMatchObject({ ctaHref: "#fresh-b2" });
  expect(validateGenerationCandidate(candidate)).toEqual(candidate);
});
test("M2C rejects nested generation limits before candidate preview", () => {
  const candidate = buildCandidate(
    JSON.stringify(content),
    input,
    provider,
    "fresh",
  );
  const features = candidate.blocks[1];
  if (features.type !== "features") throw Error("fixture");
  features.items = Array.from({ length: 7 }, () => ({
    title: "Item",
    description: "",
  }));
  expect(() => validateGenerationCandidate(candidate)).toThrow();
});
