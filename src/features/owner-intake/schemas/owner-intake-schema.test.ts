import { describe, expect, it } from "vitest";

import { EMPTY_FORM_VALUES } from "../lib/form-values";
import type { FormValues } from "../types/form";

import {
  ADDRESS_DETAIL_MAX,
  CONTACT_NAME_MAX,
  EMAIL_MAX,
  isValidPhone,
  NOTES_MAX,
  PREFERRED_CALLBACK_TIME_MAX,
  validateOwnerIntake,
} from "./owner-intake-schema";

const valid: FormValues = {
  ...EMPTY_FORM_VALUES,
  contactName: "Nguyễn Văn Thử",
  phone: "0909 123 456",
  intent: "LONG_TERM_RENT",
  provinceCode: "48",
  wardCode: "20242",
  addressDetail: "12 Đường Mẫu",
  consent: { accepted: true },
};

function errorsOf(patch: Partial<FormValues>) {
  return validateOwnerIntake({ ...valid, ...patch });
}

/** An email of exactly `length` (>= 197) characters: 64-char local part, DNS-sized domain labels. */
function emailOfLength(length: number) {
  return `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(length - 196)}.vn`;
}

describe("validateOwnerIntake", () => {
  it("accepts the minimal valid form", () => {
    expect(validateOwnerIntake(valid)).toEqual({});
  });

  it("reports every missing required field", () => {
    expect(validateOwnerIntake(EMPTY_FORM_VALUES)).toEqual({
      contactName: "required",
      phone: "required",
      intent: "required",
      provinceCode: "required",
      wardCode: "required",
      addressDetail: "required",
      "consent.accepted": "invalid",
    });
  });

  it("refuses a blank contact name and address", () => {
    expect(errorsOf({ contactName: "   ", addressDetail: " \t " })).toEqual({
      contactName: "required",
      addressDetail: "required",
    });
  });

  describe("phone (table 2.5)", () => {
    it.each(["0909 123 456", "+84 909.123.456", "(0909)-123-456", "0909\t123\n456"])("accepts %j", (phone) => {
      expect(isValidPhone(phone)).toBe(true);
      expect(errorsOf({ phone })).toEqual({});
    });

    it.each(["0123", "00909123456", "84909123456", "0009123456", "0909 123 456", "0909_123_456"])(
      "refuses %j",
      (phone) => {
        expect(isValidPhone(phone)).toBe(false);
        expect(errorsOf({ phone })).toEqual({ phone: "invalid" });
      },
    );
  });

  describe("length limits", () => {
    it.each([
      ["contactName", CONTACT_NAME_MAX, 100],
      ["addressDetail", ADDRESS_DETAIL_MAX, 255],
      ["notes", NOTES_MAX, 1000],
      ["preferredCallbackTime", PREFERRED_CALLBACK_TIME_MAX, 100],
    ] as const)("%s accepts %i characters and refuses one more", (field, max, expected) => {
      expect(max).toBe(expected);
      expect(errorsOf({ [field]: "x".repeat(max) })).toEqual({});
      expect(errorsOf({ [field]: "x".repeat(max + 1) })).toEqual({ [field]: "tooLong" });
    });

    it("counts the contact name after trimming the spaces around it", () => {
      expect(errorsOf({ contactName: `  ${"x".repeat(CONTACT_NAME_MAX)}  ` })).toEqual({});
    });

    it("counts UTF-16 code units", () => {
      expect(errorsOf({ notes: "😀".repeat(NOTES_MAX / 2) })).toEqual({});
      expect(errorsOf({ notes: `${"😀".repeat(NOTES_MAX / 2)}x` })).toEqual({ notes: "tooLong" });
    });

    it("email accepts 254 characters and refuses 255", () => {
      expect(EMAIL_MAX).toBe(254);
      const ok = emailOfLength(254);
      const tooLong = emailOfLength(255);
      expect(ok).toHaveLength(254);
      expect(tooLong).toHaveLength(255);
      expect(errorsOf({ email: ok })).toEqual({});
      expect(errorsOf({ email: tooLong })).toEqual({ email: "tooLong" });
    });
  });

  describe("email", () => {
    it("treats an empty email as absent", () => {
      expect(errorsOf({ email: "" })).toEqual({});
      expect(errorsOf({ email: "  " })).toEqual({});
    });

    it("needs a dot in the domain", () => {
      expect(errorsOf({ email: "a@b" })).toEqual({ email: "invalid" });
      expect(errorsOf({ email: "a@b.vn" })).toEqual({});
      expect(errorsOf({ email: "not-an-email" })).toEqual({ email: "invalid" });
    });

    // Server: Hibernate 9.1 @Email (AbstractEmailValidator, DomainNameUtil) plus @Pattern |[^@]+@[^@.]+(\.[^@.]+)+
    it.each([
      "a!b@x.vn",
      "Ñ@x.vn",
      "#$%&'*+/=?^_`{|}~-@x.vn",
      "first.last@x.vn",
      '"quoted local"@x.vn',
      "a@b.c",
      "a@b.1",
      "a@mail-server.example.vn",
      "a@bücher.vn",
      "a@x!y.vn",
      "a@[1.2.3.4]",
      `${"a".repeat(64)}@x.vn`,
      `a@${"b".repeat(63)}.vn`,
    ])("accepts %j like the server", (email) => {
      expect(errorsOf({ email })).toEqual({});
    });

    it.each([
      `${"a".repeat(65)}@x.vn`,
      `a@${"b".repeat(64)}.vn`,
      `a@${"ü".repeat(60)}.vn`,
      "a@b",
      "a@b.vn.",
      "a@.b.vn",
      "a@b..vn",
      ".a@x.vn",
      "a.@x.vn",
      "a..b@x.vn",
      "a b@x.vn",
      "a@b@x.vn",
      '"a@b"@x.vn',
      "a@-b.vn",
      "a@b-.vn",
      "a@b_c d.vn",
      "😀@x.vn",
      "@x.vn",
    ])("refuses %j like the server", (email) => {
      expect(errorsOf({ email })).toEqual({ email: "invalid" });
    });
  });

  describe("asking price", () => {
    it.each(["1", "15000000", "999999999999999"])("accepts %s", (amount) => {
      expect(errorsOf({ askingPrice: { amount } })).toEqual({});
    });

    it.each(["0", "1500.5", "1500.0", "-1", "1e6", "15,000,000", "1000000000000000", "abc"])("refuses %s", (amount) => {
      expect(errorsOf({ askingPrice: { amount } })).toEqual({ "askingPrice.amount": "invalid" });
    });

    it("is optional", () => {
      expect(errorsOf({ askingPrice: { amount: "" } })).toEqual({});
    });
  });

  it("refuses an unknown intent and property type", () => {
    expect(errorsOf({ intent: "RENT" as FormValues["intent"], propertyType: "CASTLE" as FormValues["propertyType"] })).toEqual({
      intent: "invalid",
      propertyType: "invalid",
    });
  });

  it("checks availableFrom is an ISO date", () => {
    expect(errorsOf({ availableFrom: "2026-11-01" })).toEqual({});
    expect(errorsOf({ availableFrom: "01/11/2026" })).toEqual({ availableFrom: "invalid" });
    expect(errorsOf({ availableFrom: "2026-02-30" })).toEqual({ availableFrom: "invalid" });
  });

  it("needs the consent box checked", () => {
    expect(errorsOf({ consent: { accepted: false } })).toEqual({ "consent.accepted": "invalid" });
  });
});
