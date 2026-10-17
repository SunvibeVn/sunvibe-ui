import { describe, expect, it } from "vitest";

import { resolvePublicApiUrl } from "./public-env";

describe("resolvePublicApiUrl", () => {
  it("falls back to the local API outside production", () => {
    expect(resolvePublicApiUrl(undefined, false)).toBe("http://localhost:8081");
  });

  it("accepts a plain http URL outside production (local API, e2e)", () => {
    expect(resolvePublicApiUrl("http://localhost:8081", false)).toBe("http://localhost:8081");
  });

  it("throws in production when the value is missing", () => {
    expect(() => resolvePublicApiUrl(undefined, true)).toThrow("Missing environment variable: NEXT_PUBLIC_API_URL");
  });

  it("accepts an https URL in production", () => {
    expect(resolvePublicApiUrl("https://api.sunvibe.vn", true)).toBe("https://api.sunvibe.vn");
  });

  it("throws in production unless the URL starts with https:// (the owner's data must not go in clear)", () => {
    expect(() => resolvePublicApiUrl("http://api.sunvibe.vn", true)).toThrow(
      "NEXT_PUBLIC_API_URL must start with https:// in production",
    );
    expect(() => resolvePublicApiUrl("api.sunvibe.vn", true)).toThrow(/https:\/\//);
  });
});
