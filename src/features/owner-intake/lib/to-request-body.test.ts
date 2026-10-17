import { describe, expect, it } from "vitest";

import type { FormValues } from "../types/form";

import { CONSENT_NOTICE_VERSION } from "./consent";
import { EMPTY_FORM_VALUES } from "./form-values";
import { toRequestBody } from "./to-request-body";

const minimal: FormValues = {
  ...EMPTY_FORM_VALUES,
  contactName: "  Nguyễn Văn Thử  ",
  phone: "0909 123 456",
  intent: "LONG_TERM_RENT",
  provinceCode: "48",
  wardCode: "20242",
  wardType: "WARD",
  addressDetail: "12 Đường Mẫu, căn A-1203",
  consent: { accepted: true },
};

describe("toRequestBody", () => {
  it("omits every empty optional field and the price object", () => {
    expect(toRequestBody(minimal)).toEqual({
      contactName: "Nguyễn Văn Thử",
      phone: "0909 123 456",
      intent: "LONG_TERM_RENT",
      provinceCode: "48",
      wardCode: "20242",
      addressDetail: "12 Đường Mẫu, căn A-1203",
      consent: { accepted: true, noticeVersion: "owner-intake-2026-10" },
    });
  });

  it("uses the consent notice version constant", () => {
    expect(CONSENT_NOTICE_VERSION).toBe("owner-intake-2026-10");
  });

  it("omits optional text fields that hold only spaces", () => {
    const body = toRequestBody({ ...minimal, email: "  ", notes: " ", preferredCallbackTime: "\t", askingPrice: { amount: " " } });
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("notes");
    expect(body).not.toHaveProperty("preferredCallbackTime");
    expect(body).not.toHaveProperty("askingPrice");
  });

  it("maps the full example body of spec 6.3", () => {
    expect(
      toRequestBody({
        ...minimal,
        email: " chunha.thu@example.com ",
        latitude: 16.0678,
        longitude: 108.2208,
        propertyType: "TWO_BEDROOM",
        askingPrice: { amount: "15000000" },
        availableFrom: "2026-11-01",
        notes: "Có nội thất",
        preferredCallbackTime: "Buổi tối",
      }),
    ).toEqual({
      contactName: "Nguyễn Văn Thử",
      phone: "0909 123 456",
      email: "chunha.thu@example.com",
      intent: "LONG_TERM_RENT",
      provinceCode: "48",
      wardCode: "20242",
      addressDetail: "12 Đường Mẫu, căn A-1203",
      latitude: 16.0678,
      longitude: 108.2208,
      propertyType: "TWO_BEDROOM",
      askingPrice: { amount: 15000000, currency: "VND", unit: "MONTH" },
      availableFrom: "2026-11-01",
      notes: "Có nội thất",
      preferredCallbackTime: "Buổi tối",
      consent: { accepted: true, noticeVersion: "owner-intake-2026-10" },
    });
  });

  it.each([
    ["SHORT_TERM_RENT", "NIGHT"],
    ["LONG_TERM_RENT", "MONTH"],
    ["SALE", "TOTAL"],
  ] as const)("derives the price unit of %s as %s", (intent, unit) => {
    expect(toRequestBody({ ...minimal, intent, askingPrice: { amount: "1500" } }).askingPrice).toEqual({
      amount: 1500,
      currency: "VND",
      unit,
    });
  });

  it("sends the amount as a JSON number", () => {
    const json = JSON.stringify(toRequestBody({ ...minimal, askingPrice: { amount: "999999999999999" } }));
    expect(json).toContain('"amount":999999999999999');
  });

  it("rounds the coordinates to 6 decimals", () => {
    const body = toRequestBody({ ...minimal, latitude: 16.067812345678901, longitude: 108.22084999999 });
    expect(body.latitude).toBe(16.067812);
    expect(body.longitude).toBe(108.22085);
  });

  it("drops the coordinates for a SPECIAL_ZONE ward", () => {
    const body = toRequestBody({ ...minimal, wardType: "SPECIAL_ZONE", latitude: 16.5, longitude: 112.3 });
    expect(body).not.toHaveProperty("latitude");
    expect(body).not.toHaveProperty("longitude");
  });

  it("sends both coordinates or neither", () => {
    const body = toRequestBody({ ...minimal, latitude: 16.0678 });
    expect(body).not.toHaveProperty("latitude");
    expect(body).not.toHaveProperty("longitude");
  });

  it("refuses to build a body without an intent", () => {
    expect(() => toRequestBody({ ...minimal, intent: "" })).toThrow();
  });
});
