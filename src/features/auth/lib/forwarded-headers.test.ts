import { describe, expect, it } from "vitest";
import { forwardedHeaders } from "./forwarded-headers";

describe("forwardedHeaders", () => {
  it("forwards the user agent and client IP", () => {
    const source = new Headers({ "user-agent": "Firefox", "x-forwarded-for": "203.0.113.7" });
    expect(forwardedHeaders(source)).toEqual({
      "User-Agent": "Firefox",
      "X-Forwarded-For": "203.0.113.7",
    });
  });

  it("falls back to x-real-ip and omits missing values", () => {
    expect(forwardedHeaders(new Headers({ "x-real-ip": "198.51.100.2" }))).toEqual({
      "X-Forwarded-For": "198.51.100.2",
    });
    expect(forwardedHeaders(new Headers())).toEqual({});
  });
});
