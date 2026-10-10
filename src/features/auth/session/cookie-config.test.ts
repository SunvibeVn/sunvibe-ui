import { describe, expect, it } from "vitest";
import {
  accessCookieOptions,
  expiredCookieOptions,
  refreshCookieOptions,
  resetCookieOptions,
  sessionCookieNames,
} from "./cookie-config";

describe("cookie-config", () => {
  it("prefixes names with __Host- in production only", () => {
    expect(sessionCookieNames(true)).toEqual({ access: "__Host-sv_at", refresh: "__Host-sv_rt" });
    expect(sessionCookieNames(false)).toEqual({ access: "sv_at", refresh: "sv_rt" });
  });

  it("expires the access cookie 30 seconds before the token", () => {
    expect(accessCookieOptions(900, true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 870,
    });
  });

  it("keeps the refresh cookie 7 days and the reset cookie 15 minutes", () => {
    expect(refreshCookieOptions(false)).toMatchObject({ secure: false, path: "/", maxAge: 604800 });
    expect(resetCookieOptions(false)).toMatchObject({ path: "/", maxAge: 900 });
  });

  it("builds deletion options with the same path and security flags", () => {
    expect(expiredCookieOptions(resetCookieOptions(true))).toMatchObject({
      path: "/",
      secure: true,
      maxAge: 0,
    });
  });
});
