import { describe, expect, it } from "vitest";

import vi from "@/i18n/messages/vi.json";

import { EMPTY_FORM_VALUES } from "./form-values";
import { validateOwnerIntake } from "../schemas/owner-intake-schema";

import {
  fieldElementId,
  fieldErrorMessage,
  fieldErrorMessages,
  firstInvalidField,
  FIELD_ORDER,
  GENERIC_ERROR_KEY,
} from "./field-errors";

/** Same lookup as next-intl `t.has` on the OwnerIntake namespace. */
function has(key: string) {
  let node: unknown = vi.OwnerIntake;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string";
}

describe("fieldErrorMessage", () => {
  it("maps a field path and kind to its message key under errors.fields", () => {
    expect(fieldErrorMessage("phone", "invalid", has)).toEqual({ key: "errors.fields.phone.invalid" });
    expect(fieldErrorMessage("askingPrice.unit", "invalid", has)).toEqual({
      key: "errors.fields.askingPrice.unit.invalid",
    });
  });

  it("feeds the length limit into tooLong messages", () => {
    expect(fieldErrorMessage("notes", "tooLong", has)).toEqual({
      key: "errors.fields.notes.tooLong",
      values: { max: 1000 },
    });
    expect(vi.OwnerIntake.errors.fields.notes.tooLong).toContain("{max}");
  });

  it("falls back to the generic message for an unknown field or kind", () => {
    expect(fieldErrorMessage("unknownField", "invalid", has)).toEqual({ key: GENERIC_ERROR_KEY });
    expect(fieldErrorMessage("phone", "tooLong", has)).toEqual({ key: GENERIC_ERROR_KEY });
    expect(GENERIC_ERROR_KEY).toBe("errors.generic");
    expect(has(GENERIC_ERROR_KEY)).toBe(true);
  });

  it("has a message for every error the client validation can produce", () => {
    const errors = validateOwnerIntake({
      ...EMPTY_FORM_VALUES,
      email: "a@b",
      intent: "X" as never,
      propertyType: "X" as never,
      askingPrice: { amount: "1.5" },
      availableFrom: "x",
    });
    const long = validateOwnerIntake({
      ...EMPTY_FORM_VALUES,
      contactName: "x".repeat(101),
      email: `${"a".repeat(250)}@b.vn`,
      addressDetail: "x".repeat(256),
      notes: "x".repeat(1001),
      preferredCallbackTime: "x".repeat(101),
    });
    for (const [field, kind] of [...Object.entries(errors), ...Object.entries(long)]) {
      expect(fieldErrorMessage(field, kind, has).key, `${field}.${kind}`).not.toBe(GENERIC_ERROR_KEY);
    }
  });
});

describe("fieldErrorMessages", () => {
  it("maps every validation kind to its message", () => {
    expect(fieldErrorMessages({ phone: "required", notes: "tooLong" }, has)).toEqual({
      phone: { key: "errors.fields.phone.required" },
      notes: { key: "errors.fields.notes.tooLong", values: { max: 1000 } },
    });
  });
});

describe("firstInvalidField", () => {
  it("picks the first invalid field in form order", () => {
    expect(firstInvalidField({ notes: "tooLong", phone: "invalid", "consent.accepted": "invalid" })).toBe("phone");
    expect(firstInvalidField({ "askingPrice.amount": "invalid", latitude: "invalid" })).toBe("latitude");
  });

  it("returns undefined when nothing is invalid", () => {
    expect(firstInvalidField({})).toBeUndefined();
  });

  it("lists the fields in form order", () => {
    expect(FIELD_ORDER[0]).toBe("contactName");
    expect(FIELD_ORDER.at(-1)).toBe("consent.accepted");
  });
});

describe("fieldElementId", () => {
  it("turns a field path into a DOM id", () => {
    expect(fieldElementId("phone")).toBe("phone");
    expect(fieldElementId("askingPrice.amount")).toBe("askingPrice-amount");
    expect(fieldElementId("consent.accepted")).toBe("consent-accepted");
  });
});
