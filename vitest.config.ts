import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next.js resolves this marker package itself; outside Next its default export throws.
      "server-only": fileURLToPath(
        new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    // Inline projects inherit the options above (Vitest 5), so both resolve `@` and `server-only`.
    projects: [
      { test: { name: "node", environment: "node", include: ["src/**/*.test.ts"] } },
      {
        test: {
          name: "render",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          // Testing Library unmounts after each test and sets React's act environment only through the global
          // afterEach and beforeAll. The tests still import describe, it and expect from vitest.
          globals: true,
        },
      },
    ],
  },
});
