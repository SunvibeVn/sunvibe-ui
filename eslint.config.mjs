import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Features expose a public API through their index.ts only.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/*", "!@/features/*/proxy", "!@/features/*/client"],
              message:
                "Import from the feature's public API (e.g. '@/features/property'), not its internals. src/proxy.ts may use '@/features/<name>/proxy'; Client Components may use '@/features/<name>/client'.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated from sunvibe-server/api/openapi.json by `npm run gen:api`.
    "src/api/generated/**",
  ]),
]);

export default eslintConfig;
