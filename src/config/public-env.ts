// Browser-visible settings. NEXT_PUBLIC_* must be read literally so Next.js inlines them.
const isProduction = process.env.NODE_ENV === "production";

/**
 * The public API origin: required and https in production (the owner's data must not travel in clear),
 * the local API otherwise.
 */
export function resolvePublicApiUrl(value: string | undefined, production: boolean): string {
  if (production) {
    if (!value) throw new Error("Missing environment variable: NEXT_PUBLIC_API_URL");
    if (!value.startsWith("https://")) throw new Error("NEXT_PUBLIC_API_URL must start with https:// in production");
    return value;
  }
  return value || "http://localhost:8081";
}

export const publicEnv = {
  /** Origin of the public API that the browser calls directly (ADR-001, ADR-008). */
  get apiUrl() {
    return resolvePublicApiUrl(process.env.NEXT_PUBLIC_API_URL, isProduction);
  },
};
