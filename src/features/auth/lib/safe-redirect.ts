const PLACEHOLDER_ORIGIN = "http://localhost";

/**
 * `next` when it is a path on this site, otherwise `fallback`. Blocks open
 * redirects such as `//evil.com`, `/\evil.com` and absolute URLs.
 */
export function safeRedirectPath(next: unknown, fallback: string): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  try {
    // The URL parser strips tabs/newlines, so "/\t/evil.com" becomes "//evil.com".
    const url = new URL(next, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
    // Dot segments collapse during parsing ("/.//evil.com" → "//evil.com"), so check the result too.
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith("//") || path.startsWith("/\\") ? fallback : path;
  } catch {
    return fallback;
  }
}
