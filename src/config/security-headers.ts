// Response headers set by next.config.ts `headers()` (SEC-M3, SV-023). Kept here so a unit test can check them.

export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/**
 * Every page, the public ones included, must never be framed by another site (clickjacking): CSP `frame-ancestors` for
 * current browsers and `X-Frame-Options` for older ones. No other directive yet: the rest of the policy (auth
 * hardening spec 5.2, H-11) is W22b Task B3, and nothing here may block the inline scripts Next and React need.
 */
const SITE_CSP = "frame-ancestors 'none'";

/**
 * The workspace's images (survey-media spec 6.2, 8, SV-023): `blob:` for the survey photos, shown only through object
 * URLs made from the API's answers; `data:` and the OpenStreetMap tile host for the W15/W16 maps and styles. Nothing
 * wider: no image of another origin, the API's included, is ever loaded by URL.
 */
const WORKSPACE_CSP = "frame-ancestors 'none'; img-src 'self' blob: data: https://tile.openstreetmap.org";

/**
 * Next applies every rule whose source matches, in order, and a later value of the same header wins. So the site-wide
 * rule (four headers of H-11, with its values) comes first, and the workspace rule last, where its CSP replaces the
 * site-wide one. `/:path*` also matches `/`; `/workspace/:path*` also matches `/workspace` itself.
 */
export function securityHeaders(): HeaderRule[] {
  return [
    {
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: SITE_CSP },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
    {
      source: "/workspace/:path*",
      headers: [
        { key: "Content-Security-Policy", value: WORKSPACE_CSP },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    },
  ];
}
