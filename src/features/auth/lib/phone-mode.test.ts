import { describe, expect, it } from "vitest";
import { parsePhoneMode, phoneRouteAccess } from "./phone-mode";

describe("parsePhoneMode", () => {
  it("reads the three modes", () => {
    expect(parsePhoneMode("off")).toBe("off");
    expect(parsePhoneMode("legacy-login")).toBe("legacy-login");
    expect(parsePhoneMode("on")).toBe("on");
  });

  it.each(["ON", " on", "true", "legacy", "yes"])("mode_unknownValue_off: %j", (value) => {
    expect(parsePhoneMode(value)).toBe("off");
  });

  it.each([undefined, ""])("mode_empty_off: %j", (value) => {
    expect(parsePhoneMode(value)).toBe("off");
  });
});

describe("phoneRouteAccess", () => {
  it("phoneLoginRoute_off_notFound", () => {
    expect(phoneRouteAccess("login", "off")).toBe("not-found");
  });

  it("shows the phone login in legacy-login and on", () => {
    expect(phoneRouteAccess("login", "legacy-login")).toBe("show");
    expect(phoneRouteAccess("login", "on")).toBe("show");
  });

  it("phoneSignUpRoute_legacy_notFound", () => {
    expect(phoneRouteAccess("sign-up", "legacy-login")).toBe("not-found");
  });

  it("shows the phone sign-up only in on", () => {
    expect(phoneRouteAccess("sign-up", "off")).toBe("not-found");
    expect(phoneRouteAccess("sign-up", "on")).toBe("show");
  });

  it("verifyPhoneRoute_off_redirectsAccount", () => {
    expect(phoneRouteAccess("verify-phone", "off")).toBe("account");
  });

  it("sends verify-phone to the account in legacy-login and keeps it in on", () => {
    expect(phoneRouteAccess("verify-phone", "legacy-login")).toBe("account");
    expect(phoneRouteAccess("verify-phone", "on")).toBe("show");
  });
});
