import { describe, expect, it } from "vitest";
import {
  forgotByEmailSchema,
  loginSchema,
  normalizePhone,
  otpSchema,
  registerSchema,
  resetPasswordSchema,
} from "./auth.schema";

const validRegistration = {
  fullName: "Nguyen Van An",
  username: "0901234567",
  email: "",
  idCardNumber: "",
  password: "Sunvibe@2026",
  confirmPassword: "Sunvibe@2026",
};

describe("normalizePhone", () => {
  it.each([
    ["090 123 4567", "0901234567"],
    ["090.123.4567", "0901234567"],
    ["(090) 123-4567", "0901234567"],
    ["+84901234567", "0901234567"],
    ["+84 90 123 4567", "0901234567"],
  ])("normalizes %j", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe("loginSchema", () => {
  it("accepts a formatted phone and returns digits only", () => {
    const result = loginSchema.safeParse({ username: "+84 90 123 4567", password: "x" });
    expect(result.success && result.data.username).toBe("0901234567");
  });

  it("rejects a too-short phone and an empty password", () => {
    const result = loginSchema.safeParse({ username: "12345", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("accepts a valid registration with optional fields empty", () => {
    expect(registerSchema.safeParse(validRegistration).success).toBe(true);
  });

  it.each([
    ["short", "Ab1@"],
    ["no uppercase", "sunvibe@2026"],
    ["no lowercase", "SUNVIBE@2026"],
    ["no digit", "Sunvibe@abcd"],
    ["no special", "Sunvibe2026"],
    ["disallowed char", "Sunvibe@2026#"],
    ["too long", `Aa1@${"a".repeat(69)}`],
  ])("rejects a password that is %s", (_label, password) => {
    const result = registerSchema.safeParse({ ...validRegistration, password, confirmPassword: password });
    expect(result.success).toBe(false);
  });

  it("reports mismatched passwords on confirmPassword", () => {
    const result = registerSchema.safeParse({ ...validRegistration, confirmPassword: "Other@2026" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === "confirmPassword")).toBe(true);
  });

  it("validates the optional e-mail and ID card when provided", () => {
    expect(registerSchema.safeParse({ ...validRegistration, email: "not-an-email" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegistration, idCardNumber: "12345" }).success).toBe(false);
    expect(
      registerSchema.safeParse({ ...validRegistration, email: "an@sunvibe.vn", idCardNumber: "012345678901" }).success,
    ).toBe(true);
  });

  it("rejects a full name shorter than 6 characters", () => {
    expect(registerSchema.safeParse({ ...validRegistration, fullName: "An" }).success).toBe(false);
  });
});

describe("otp, forgot and reset schemas", () => {
  it("accepts exactly six digits", () => {
    expect(otpSchema.safeParse({ code: "123456" }).success).toBe(true);
    expect(otpSchema.safeParse({ code: "12345" }).success).toBe(false);
  });

  it("requires a valid e-mail to request a reset", () => {
    expect(forgotByEmailSchema.safeParse({ email: "an@sunvibe.vn" }).success).toBe(true);
    expect(forgotByEmailSchema.safeParse({ email: "" }).success).toBe(false);
  });

  it("requires token, code and matching strong passwords to reset", () => {
    const base = { resetToken: "t", otpCode: "123456", newPassword: "Sunvibe@2026", confirmPassword: "Sunvibe@2026" };
    expect(resetPasswordSchema.safeParse(base).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ ...base, resetToken: "" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...base, confirmPassword: "x" }).success).toBe(false);
  });
});
