import { describe, expect, it } from "vitest";
import { guardRedirect, isProtectedPath } from "./route-guard";

const at = (path: string) => new URL(path, "http://localhost:3000");

describe("guardRedirect", () => {
  it("sends signed-out visitors of protected pages to login with a return path", () => {
    expect(guardRedirect(at("/account?tab=1"), false)?.toString()).toBe(
      "http://localhost:3000/login?next=%2Faccount%3Ftab%3D1",
    );
    expect(guardRedirect(at("/verify-phone"), false)?.pathname).toBe("/login");
  });

  it("sends signed-in users away from guest-only pages", () => {
    expect(guardRedirect(at("/login"), true)?.pathname).toBe("/account");
    expect(guardRedirect(at("/sign-up"), true)?.pathname).toBe("/account");
  });

  it("lets a stale session reach the login page when the server said it expired", () => {
    expect(guardRedirect(at("/login?session=expired&next=%2Faccount"), true)).toBeNull();
  });

  it("leaves every other page alone", () => {
    expect(guardRedirect(at("/"), false)).toBeNull();
    expect(guardRedirect(at("/reset-password?token=x"), true)).toBeNull();
    expect(guardRedirect(at("/accounting"), false)).toBeNull();
  });
});

describe("isProtectedPath", () => {
  it("matches the protected pages and their sub-paths only", () => {
    expect(isProtectedPath("/account")).toBe(true);
    expect(isProtectedPath("/account/profile")).toBe(true);
    expect(isProtectedPath("/verify-phone")).toBe(true);
    expect(isProtectedPath("/accounting")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
  });
});
