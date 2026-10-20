import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["server/test-safety.ts"],
    include: ["server/**/*.test.ts"],
    testTimeout: 5000,
  },
});
