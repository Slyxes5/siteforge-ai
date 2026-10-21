import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [
    {
      name: "siteforge-local-puck-fonts",
      enforce: "pre",
      transform(code, id) {
        // Keep Puck's styles, but use its system-font fallback instead of a CDN.
        // Never patch dependencies on disk. The browser E2E guards this boundary.
        if (
          id
            .split("?")[0]
            .replaceAll("\\", "/")
            .endsWith("/@puckeditor/core/dist/index.css")
        ) {
          return code.replace(
            /^@import\s+["']https:\/\/rsms\.me\/inter\/inter\.css["'];\s*/m,
            "",
          );
        }
      },
    },
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:5188", changeOrigin: true } },
  },
  preview: {
    proxy: { "/api": { target: "http://127.0.0.1:5188", changeOrigin: true } },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
