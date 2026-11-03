// Response headers set by next.config.ts `headers()` (SEC-M3). Kept here so a unit test can check them.

export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/**
 * The workspace's images (survey-media spec 6.2, 8, SV-023): `blob:` for the survey photos, shown only through object
 * URLs made from the API's answers; `data:` and the OpenStreetMap tile host for the W15/W16 maps and styles. Nothing
 * wider: no image of another origin, the API's included, is ever loaded by URL.
 */
const WORKSPACE_CSP = "frame-ancestors 'none'; img-src 'self' blob: data: https://tile.openstreetmap.org";

/**
 * The staff workspace must never be framed by another site (clickjacking on lead commands): CSP `frame-ancestors` for
 * current browsers and `X-Frame-Options` for older ones. `/workspace/:path*` also matches `/workspace` itself.
 */
export function securityHeaders(): HeaderRule[] {
  return [
    {
      source: "/workspace/:path*",
      headers: [
        { key: "Content-Security-Policy", value: WORKSPACE_CSP },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    },
  ];
}
