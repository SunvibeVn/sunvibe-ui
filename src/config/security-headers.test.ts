import { describe, expect, it } from "vitest";

import { securityHeaders } from "./security-headers";

describe("securityHeaders (SEC-M3)", () => {
  it("forbids framing every workspace page, the workspace root included", () => {
    const rules = securityHeaders();
    const workspace = rules.find((rule) => rule.source === "/workspace/:path*");
    expect(workspace?.headers).toEqual([
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; img-src 'self' blob: data: https://tile.openstreetmap.org" },
      { key: "X-Frame-Options", value: "DENY" },
    ]);
  });

  it("workspaceCsp_isExactlyFrameAncestorsNoneAndImgSrcSelfBlobDataOsmTiles (survey-media spec 6.2, SV-023)", () => {
    const workspace = securityHeaders().find((rule) => rule.source === "/workspace/:path*");
    const csp = workspace?.headers.find((header) => header.key === "Content-Security-Policy")?.value;
    // blob: for the photos' object URLs, data: and the OpenStreetMap tile host for the W15/W16 maps; nothing wider.
    expect(csp).toBe("frame-ancestors 'none'; img-src 'self' blob: data: https://tile.openstreetmap.org");
  });

  it("adds no other rule", () => {
    expect(securityHeaders()).toHaveLength(1);
  });
});
