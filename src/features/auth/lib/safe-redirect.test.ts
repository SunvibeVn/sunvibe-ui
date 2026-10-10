import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps same-site paths with query and hash", () => {
    expect(safeRedirectPath("/account?tab=1#top", "/")).toBe("/account?tab=1#top");
  });

  it.each([
    ["//evil.com"],
    ["/\\evil.com"],
    ["https://evil.com"],
    ["/\t/evil.com"],
    ["account"],
    [""],
    [null],
    [42],
  ])("rejects %j", (next) => {
    expect(safeRedirectPath(next, "/account")).toBe("/account");
  });
});
