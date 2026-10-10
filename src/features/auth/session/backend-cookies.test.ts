import { describe, expect, it } from "vitest";
import { readSetCookie } from "./backend-cookies";

const headers = [
  "cookie-jwt=access123; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Strict",
  "cookie-jwt-rf=refresh456; Path=/api/auth; Max-Age=604800; HttpOnly; Secure; SameSite=Strict",
];

describe("readSetCookie", () => {
  it("finds a cookie by exact name", () => {
    expect(readSetCookie(headers, "cookie-jwt-rf")).toBe("refresh456");
    expect(readSetCookie(headers, "cookie-jwt")).toBe("access123");
  });

  it("returns undefined for a missing or cleared cookie", () => {
    expect(readSetCookie(headers, "other")).toBeUndefined();
    expect(readSetCookie(["cookie-jwt-rf=; Path=/api/auth; Max-Age=0"], "cookie-jwt-rf")).toBeUndefined();
  });
});
