// Browser-visible settings. NEXT_PUBLIC_* must be read literally so Next.js inlines them.
const isProduction = process.env.NODE_ENV === "production";

export const publicEnv = {
  /** Origin of the public API that the browser calls directly (ADR-001, ADR-008). */
  get apiUrl() {
    const value = process.env.NEXT_PUBLIC_API_URL;
    if (value) return value;
    if (isProduction) throw new Error("Missing environment variable: NEXT_PUBLIC_API_URL");
    return "http://localhost:8081";
  },
};
