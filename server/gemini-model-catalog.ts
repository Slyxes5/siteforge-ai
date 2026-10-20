/** Documentation eligibility only, NOT project access/quota/billing verification. */
export const GEMINI_MODEL_CATALOG = Object.freeze({
  "gemini-3.5-flash-lite": {
    structuredOutput: true,
    freeTierText: true,
    modelUrl:
      "https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite",
  },
  "gemini-3.8-flash": {
    structuredOutput: true,
    freeTierText: true,
    modelUrl: "https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash",
  },
} as const);
export const GEMINI_PRICING_SOURCE =
  "https://ai.google.dev/gemini-api/docs/pricing";
export type CatalogModel = keyof typeof GEMINI_MODEL_CATALOG;
