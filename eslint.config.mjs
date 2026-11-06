import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// In flat config a later block replaces the options of a rule, so every block below repeats this pattern.
const FEATURE_PUBLIC_API = {
  group: [
    "@/features/*/*",
    "!@/features/*/proxy",
    "!@/features/*/client",
    "!@/features/auth/phone",
    "!@/features/lead-shared/session-sync",
  ],
  message:
    "Import from the feature's public API (e.g. '@/features/property'), not its internals. src/proxy.ts may use '@/features/<name>/proxy'; Client Components may use '@/features/<name>/client'; only phone routes may use '@/features/auth/phone'; only the root layout may use '@/features/lead-shared/session-sync'.",
};

const NOT_OWNER_LEADS = {
  group: ["@/features/owner-leads*", "**/owner-leads/**"],
  message: "This feature sits below owner-leads and never imports it: the lead page passes in what is needed.",
};

const NOT_SURVEYS = {
  group: ["@/features/surveys*", "**/surveys/**"],
  message: "lead-shared sits below surveys and never imports it.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Features expose a public API through their index.ts only.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [FEATURE_PUBLIC_API] }],
    },
  },
  {
    files: ["src/features/surveys/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [FEATURE_PUBLIC_API, NOT_OWNER_LEADS] }],
    },
  },
  {
    files: ["src/features/lead-shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [FEATURE_PUBLIC_API, NOT_OWNER_LEADS, NOT_SURVEYS] }],
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
