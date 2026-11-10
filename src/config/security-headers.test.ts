import { modifyRouteRegex } from "next/dist/lib/redirect-status";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it } from "vitest";

import { securityHeaders } from "./security-headers";

/**
 * The headers a response gets: Next applies every rule whose source matches the path, in order, and a later value of
 * the same header replaces an earlier one. Matched as Next's server matches a header rule
 * (server/lib/router-utils/filesystem.js, buildCustomRoute): its matcher, with the optional trailing slash that
 * modifyRouteRegex adds, which is what lets `/:path*` match `/`.
 */
function matches(source: string, pathname: string): boolean {
  const match = getPathMatch(source, {
    strict: true,
    removeUnnamedParams: true,
    regexModifier: (regex) => modifyRouteRegex(regex),
  });
  return match(pathname) !== false;
}

function effectiveHeaders(pathname: string, siteUrl?: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rule of securityHeaders(siteUrl)) {
    if (!matches(rule.source, pathname)) continue;
    for (const { key, value } of rule.headers) result[key.toLowerCase()] = value;
  }
  return result;
}

// H-11 values (auth hardening spec 5.2) for the four headers W33 ships site-wide (SV-023).
const SITE_WIDE = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
};

describe("securityHeaders (SEC-M3, SV-023, W33 Task G4)", () => {
  it("rulesInOrder_siteWideFirstWorkspaceLast", () => {
    expect(securityHeaders().map((rule) => rule.source)).toEqual(["/:path*", "/workspace/:path*"]);
  });

  it.each(["/", "/login", "/reset-password", "/list-with-us", "/account"])(
    "effectiveHeaders_publicPage_%s_hasTheFourSiteWideHeaders",
    (pathname) => {
      expect(effectiveHeaders(pathname)).toEqual({
        ...SITE_WIDE,
        "content-security-policy": "frame-ancestors 'none'",
      });
    },
  );

  it.each(["/workspace", "/workspace/x", "/workspace/owner-leads/123"])(
    "effectiveHeaders_workspace_%s_keepsItsImgSrcAndForbidsFraming",
    (pathname) => {
      expect(effectiveHeaders(pathname)).toEqual({
        ...SITE_WIDE,
        // survey-media spec 6.2: blob: for the photos' object URLs, data: and the OpenStreetMap tile host for the
        // W15/W16 maps; nothing wider.
        "content-security-policy": "frame-ancestors 'none'; img-src 'self' blob: data: https://tile.openstreetmap.org",
      });
    },
  );

  it("noScriptSrcOrDefaultSrc_soTheFormReplayScriptStillRuns (H-11 rest stays in W22b Task B3)", () => {
    for (const rule of securityHeaders()) {
      const csp = rule.headers.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
      expect(csp).not.toMatch(/(script-src|default-src)/);
    }
  });
});

// W35a Task U1 (plan D-10): every host but www (test.sunvibe.vn, a preview, a local build) asks not to be indexed. The
// rule compares origins, so a trailing slash or a capital letter in the variable changes nothing.
const NOINDEX = "noindex, nofollow";
const PATHS = ["/", "/login", "/list-with-us", "/workspace/x", "/robots.txt", "/sitemap.xml"];

describe("securityHeaders by site (W35a Task U1, D-10)", () => {
  it.each(["https://test.sunvibe.vn", "https://sunvibe.vn", "http://www.sunvibe.vn", "http://localhost:3000"])(
    "securityHeaders_nonProductionSite_addsNoindex (%s)",
    (siteUrl) => {
      for (const pathname of PATHS) {
        expect(effectiveHeaders(pathname, siteUrl), pathname).toEqual({
          ...effectiveHeaders(pathname),
          "x-robots-tag": NOINDEX,
        });
      }
    },
  );

  it.each([undefined, "https://www.sunvibe.vn", "https://www.sunvibe.vn/", "https://WWW.Sunvibe.vn"])(
    "securityHeaders_productionSite_hasNoNoindex (%s)",
    (siteUrl) => {
      expect(securityHeaders(siteUrl)).toEqual(securityHeaders());
      for (const pathname of PATHS) {
        expect(effectiveHeaders(pathname, siteUrl), pathname).not.toHaveProperty("x-robots-tag");
      }
    },
  );
});
