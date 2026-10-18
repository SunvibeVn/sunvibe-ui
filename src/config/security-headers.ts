// Response headers set by next.config.ts `headers()` (SEC-M3). Kept here so a unit test can check them.

export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/**
 * The staff workspace must never be framed by another site (clickjacking on lead commands): CSP `frame-ancestors` for
 * current browsers and `X-Frame-Options` for older ones. `/workspace/:path*` also matches `/workspace` itself.
 */
export function securityHeaders(): HeaderRule[] {
  return [
    {
      source: "/workspace/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    },
  ];
}
