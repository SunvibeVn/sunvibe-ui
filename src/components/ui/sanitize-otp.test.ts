import { describe, expect, it } from "vitest";
import { sanitizeOtp } from "./sanitize-otp";

describe("sanitizeOtp", () => {
  it.each([
    ["123456", "123456"],
    ["123 456", "123456"],
    ["123-456", "123456"],
    [" 12a34b56 ", "123456"],
    ["1234567890", "123456"],
  ])("cleans %j", (input, expected) => {
    expect(sanitizeOtp(input, 6)).toBe(expected);
  });

  it("respects a shorter remaining length", () => {
    expect(sanitizeOtp("98765", 2)).toBe("98");
  });
});
