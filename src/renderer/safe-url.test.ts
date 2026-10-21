import { describe, it, expect } from "vitest";
import { safeRenderUrl } from "./safe-url";
describe("safe transient editor URLs", () => {
  it("blocks executable URLs even before editor data is accepted", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,x",
      "//external.test",
      "https:\\evil.test",
      " https://example.test",
    ])
      expect(safeRenderUrl(value)).toBeUndefined();
  });
  it("retains supported URLs without rewriting them", () => {
    for (const value of [
      "https://example.test/a",
      "/sample-landscape.svg",
      "#contact",
    ])
      expect(safeRenderUrl(value)).toBe(value);
  });
});
