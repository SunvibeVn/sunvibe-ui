// Server-side settings. None has the NEXT_PUBLIC_ prefix, so Next.js never
// inlines them into browser bundles. No "server-only" import: src/proxy.ts
// reads this module, and proxy code doesn't run as a React Server Component.
const isProduction = process.env.NODE_ENV === "production";

export const serverEnv = {
  /** sunvibe-server is a modular monolith: every module answers on one base URL. */
  get apiBaseUrl() {
    const value = process.env.API_BASE_URL;
    if (value) return value;
    if (isProduction) throw new Error("Missing environment variable: API_BASE_URL");
    return "http://localhost:8081";
  },
  isProduction,
};
