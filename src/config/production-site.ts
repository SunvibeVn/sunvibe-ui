// The one host that may be indexed (W35a plan Task U1). Imports nothing: next.config.ts loads it through
// security-headers.ts, outside the app's `@/` alias.

/** The production site (G2 D-44, SV-024): www.sunvibe.vn serves the pages, the apex redirects to it. */
export const PRODUCTION_SITE_URL = "https://www.sunvibe.vn";

/**
 * Whether a site URL is the production site. Unset (the CI build, and Vercel production today) means production. The
 * origins are compared, not the strings, so a trailing slash or a capital letter changes nothing; any other host,
 * scheme or port (test.sunvibe.vn, a preview, a local build) is not production.
 */
export function isProductionSite(siteUrl: string | undefined): boolean {
  return new URL(siteUrl ?? PRODUCTION_SITE_URL).origin === new URL(PRODUCTION_SITE_URL).origin;
}
