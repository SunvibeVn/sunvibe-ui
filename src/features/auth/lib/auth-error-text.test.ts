import { describe, expect, it } from "vitest";
import type { PublicApiHttpError, PublicApiNetworkError } from "@/lib/api";
import { authErrorText, type AuthErrorScreen } from "./auth-error-text";

const GENERIC = "We couldn't reach the server. Please try again.";
const CODE_ELSEWHERE = "The code is incorrect or has expired.";

function http(status: number, code?: string, retryAfterSeconds?: number): PublicApiHttpError {
  return { ok: false, kind: "http", status, code, fieldErrors: [], retryAfterSeconds };
}

const network: PublicApiNetworkError = { ok: false, kind: "network" };
const OTHER_SCREENS: AuthErrorScreen[] = ["login", "reset", "generic"];

describe("authErrorText", () => {
  it("authErrorText_INVALID_CREDENTIALS_login", () => {
    expect(authErrorText(http(401, "INVALID_CREDENTIALS"), "login")).toBe("Phone number or password is incorrect.");
  });

  it("authErrorText_ACCOUNT_LOCKED_login", () => {
    expect(authErrorText(http(423, "ACCOUNT_LOCKED", 300), "login")).toBe(
      "Too many failed attempts. Try again in 5 minutes.",
    );
  });

  it("authErrorText_RATE_LIMITED_generic", () => {
    expect(authErrorText(http(429, "RATE_LIMITED", 45), "generic")).toBe(
      "Too many requests. Please wait 45 seconds and try again.",
    );
  });

  it("authErrorText_CODE_RESEND_TOO_SOON_sign-up-code", () => {
    expect(authErrorText(http(429, "CODE_RESEND_TOO_SOON", 60), "sign-up-code")).toBe(
      "Too many requests. Please wait 1 minute and try again.",
    );
  });

  it("authErrorText_CODE_DAILY_LIMIT_sign-up-code", () => {
    expect(authErrorText(http(429, "CODE_DAILY_LIMIT", 7200), "sign-up-code")).toBe(
      "Too many requests. Please wait 120 minutes and try again.",
    );
  });

  it("authErrorText_CODE_DAILY_LIMIT_generic", () => {
    expect(authErrorText(http(429, "CODE_DAILY_LIMIT", 61), "generic")).toBe(
      "Too many requests. Please wait 2 minutes and try again.",
    );
  });

  it("formats a missing wait as a few minutes", () => {
    expect(authErrorText(http(423, "ACCOUNT_LOCKED"), "login")).toBe(
      "Too many failed attempts. Try again in a few minutes.",
    );
    expect(authErrorText(http(429, "RATE_LIMITED", 0), "login")).toBe(
      "Too many requests. Please wait a few minutes and try again.",
    );
  });

  it("authErrorText_CODE_INCORRECT_sign-up-code", () => {
    expect(authErrorText(http(400, "CODE_INCORRECT"), "sign-up-code")).toBe("Incorrect verification code.");
  });

  it("authErrorText_CODE_EXPIRED_sign-up-code", () => {
    expect(authErrorText(http(400, "CODE_EXPIRED"), "sign-up-code")).toBe(
      "The verification code is invalid or has expired. Please request a new one.",
    );
  });

  it("authErrorText_CODE_ATTEMPTS_EXCEEDED_sign-up-code", () => {
    expect(authErrorText(http(400, "CODE_ATTEMPTS_EXCEEDED"), "sign-up-code")).toBe(
      "Too many incorrect codes. Please request a new one.",
    );
  });

  it.each(["CODE_INCORRECT", "CODE_EXPIRED", "CODE_ATTEMPTS_EXCEEDED"])("authErrorText_%s_elsewhere", (code) => {
    for (const screen of OTHER_SCREENS) expect(authErrorText(http(400, code), screen)).toBe(CODE_ELSEWHERE);
  });

  it("authErrorText_RESET_TOKEN_INVALID_reset", () => {
    expect(authErrorText(http(400, "RESET_TOKEN_INVALID"), "reset")).toBe(
      "This reset link is invalid or has expired. Request a new one.",
    );
  });

  it("authErrorText_ACCOUNT_DISABLED_reset", () => {
    expect(authErrorText(http(401, "ACCOUNT_DISABLED"), "reset")).toBe("Account is locked or disabled.");
  });

  it("authErrorText_network_anyScreen", () => {
    for (const screen of [...OTHER_SCREENS, "sign-up-code" as const]) expect(authErrorText(network, screen)).toBe(GENERIC);
  });

  it("authErrorText_INTERNAL_ERROR_login", () => {
    expect(authErrorText(http(500, "INTERNAL_ERROR"), "login")).toBe(GENERIC);
  });

  it("treats any 5xx as unreachable, whatever its code", () => {
    expect(authErrorText(http(503), "login")).toBe(GENERIC);
    expect(authErrorText(http(502, "INVALID_CREDENTIALS"), "login")).toBe(GENERIC);
  });

  it.each(["MALFORMED_REQUEST", "NOT_FOUND", "ORIGIN_NOT_ALLOWED", "REGISTRATION_TOKEN_INVALID", "ALREADY_VERIFIED"])(
    "authErrorText_%s_generic",
    (code) => {
      expect(authErrorText(http(400, code), "generic")).toBe(GENERIC);
    },
  );

  it("falls back to the generic text for an unknown code or no code (never the status alone)", () => {
    expect(authErrorText(http(418, "SOMETHING_NEW"), "login")).toBe(GENERIC);
    expect(authErrorText(http(401), "login")).toBe(GENERIC);
    expect(authErrorText(http(429), "login")).toBe(GENERIC);
  });

  it("gives the wrong-password text only on the login screen", () => {
    expect(authErrorText(http(401, "INVALID_CREDENTIALS"), "generic")).toBe(GENERIC);
  });
});
