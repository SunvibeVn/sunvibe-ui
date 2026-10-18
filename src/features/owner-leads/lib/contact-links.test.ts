import { describe, expect, it } from "vitest";

import { mailtoHref, telHref } from "./contact-links";

describe("mailtoHref (SEC-M1)", () => {
  it("links a plain address", () => {
    expect(mailtoHref("chu.nha@example.com")).toBe("mailto:chu.nha@example.com");
    expect(mailtoHref("  an+lead@example.vn ")).toBe("mailto:an+lead@example.vn");
  });

  it("refuses an address that would add headers or recipients to the mail (plain text instead)", () => {
    expect(mailtoHref("x?cc=evil@example.com")).toBeNull();
    expect(mailtoHref("x@example.com?bcc=evil@example.com")).toBeNull();
    expect(mailtoHref("x@example.com&body=hi")).toBeNull();
    expect(mailtoHref("x@example.com#frag")).toBeNull();
    expect(mailtoHref("x%3Fcc=evil@example.com")).toBeNull();
    expect(mailtoHref("x@example.com,evil@example.com")).toBeNull();
    expect(mailtoHref("x@example.com;evil@example.com")).toBeNull();
  });

  it("refuses an empty value or one without a single @", () => {
    expect(mailtoHref("")).toBeNull();
    expect(mailtoHref("   ")).toBeNull();
    expect(mailtoHref("no-at-sign")).toBeNull();
    expect(mailtoHref("a@b@c")).toBeNull();
  });

  it("percent-encodes what a URI may not hold", () => {
    expect(mailtoHref("chủ.nhà@example.vn")).toBe(`mailto:${encodeURI("chủ.nhà")}@example.vn`);
    expect(mailtoHref('a"b@example.com')).toBe("mailto:a%22b@example.com");
  });
});

describe("telHref (SEC-M1)", () => {
  it("links a phone number of digits, spaces and a leading +", () => {
    expect(telHref("+84912000001")).toBe("tel:+84912000001");
    expect(telHref("0912 000 001")).toBe("tel:0912000001");
    expect(telHref(" 0912000001 ")).toBe("tel:0912000001");
  });

  it("refuses anything else (plain text instead)", () => {
    expect(telHref("")).toBeNull();
    expect(telHref("12345")).toBeNull();
    expect(telHref("0912000001;ext=1")).toBeNull();
    expect(telHref("0912-000-001")).toBeNull();
    expect(telHref("++84912000001")).toBeNull();
    expect(telHref("javascript:alert(1)")).toBeNull();
    expect(telHref("1".repeat(21))).toBeNull();
  });
});
