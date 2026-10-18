import { describe, expect, it } from "vitest";

import { securityHeaders } from "./security-headers";

describe("securityHeaders (SEC-M3)", () => {
  it("forbids framing every workspace page, the workspace root included", () => {
    const rules = securityHeaders();
    const workspace = rules.find((rule) => rule.source === "/workspace/:path*");
    expect(workspace?.headers).toEqual([
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Frame-Options", value: "DENY" },
    ]);
  });

  it("adds no other rule", () => {
    expect(securityHeaders()).toHaveLength(1);
  });
});
