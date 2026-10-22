import { GenerationValidationError } from "./generation-validation";

const visibleFields = [
  "text",
  "subtitle",
  "ctaText",
  "body",
  "alt",
  "imageAlt",
  "email",
  "phone",
  "address",
  "openingHours",
] as const;
// Longest fact forms first: currency/phone context must not dissolve into bare numbers.
const factPattern =
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|(?:\b(?:Rp|IDR|USD|EUR|GBP|MYR|RM)\s*|[$€£¥]\s*)\d+(?:[.,]\d+)*(?:\s*(?:ribu|juta|million|billion|k))?|\+?\d[\d ()-]{6,}\d|\d+(?:[.,]\d+)*(?:\s*%|\s*(?:ribu|juta|million|billion))?/giu;
const facts = (text: string) =>
  Array.from(text.matchAll(factPattern), (match) => match[0]);

/** Deterministic copied-contact and visible numeric/email checks, not proof of arbitrary
 * natural-language truth (e.g. invented awards or a nonnumeric street name in prose).
 * Call after schema parsing; identifiers, layout metadata and URLs are deliberately ignored.
 */
export function assertGroundedContent(
  blocks: readonly unknown[],
  input: { name: string; prompt: string },
): void {
  const sources = [input.name, input.prompt];
  const suppliedFacts = new Set(sources.flatMap(facts));
  // A copied currency value may be rendered without its prefix, never the reverse.
  for (const fact of suppliedFacts) {
    const numericPrice = fact.replace(
      /^(?:\b(?:Rp|IDR|USD|EUR|GBP|MYR|RM)\s*|[$€£¥]\s*)/iu,
      "",
    );
    if (numericPrice !== fact) suppliedFacts.add(numericPrice);
  }
  const reject = (): never => {
    throw new GenerationValidationError(
      "content_semantics",
      "UNSUPPORTED_BUSINESS_FACT",
    );
  };
  const inspect = (
    record: Record<string, unknown>,
    keys: readonly string[],
  ) => {
    for (const key of keys) {
      const text = record[key];
      if (
        typeof text === "string" &&
        facts(text).some((fact) => !suppliedFacts.has(fact))
      )
        reject();
    }
  };
  for (const value of blocks) {
    if (!value || typeof value !== "object") continue;
    const block = value as Record<string, unknown>;
    inspect(block, visibleFields);
    if (block.type === "features" && Array.isArray(block.items)) {
      for (const item of block.items) {
        if (item && typeof item === "object")
          inspect(item as Record<string, unknown>, ["title", "description"]);
      }
    }
    if (block.type === "menu" && Array.isArray(block.items)) {
      for (const item of block.items) {
        if (item && typeof item === "object")
          inspect(item as Record<string, unknown>, [
            "title",
            "description",
            "price",
            "imageAlt",
          ]);
      }
    }
    if (block.type === "gallery" && Array.isArray(block.items)) {
      for (const item of block.items) {
        if (item && typeof item === "object")
          inspect(item as Record<string, unknown>, ["alt", "caption"]);
      }
    }
    if (block.type === "contact") {
      for (const key of ["email", "phone", "address", "openingHours"]) {
        const field = block[key];
        if (
          typeof field === "string" &&
          field !== "" &&
          !sources.some((source) => source.includes(field))
        ) {
          throw new GenerationValidationError(
            "content_semantics",
            "UNSUPPORTED_BUSINESS_FACT",
          );
        }
      }
    }
  }
}
