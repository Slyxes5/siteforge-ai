// Explicit test-only bootstrap: never inherit a real provider key or live switch.
process.env.SITEFORGE_AI_PROVIDER = "mock";
process.env.SITEFORGE_AI_TEST_MODE = "true";
process.env.SITEFORGE_AI_ALLOW_LIVE = "false";
process.env.SITEFORGE_GEMINI_API_KEY = "";
await import("../server/start");
export {};
