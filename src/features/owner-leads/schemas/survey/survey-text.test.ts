import { describe, expect, it } from "vitest";

import {
  basisDateProblem,
  DURATIONS,
  durationOf,
  isIsoDate,
  optionalText,
  requiredText,
  startWindowProblem,
} from "./survey-text";

const first = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : result.error?.issues[0].message;

describe("requiredText and optionalText (BR-4, A-14, A-24)", () => {
  it("counts the trimmed NFC text, as the server does", () => {
    expect(first(requiredText(3).safeParse("  abc  "))).toBeNull();
    // "ầ" as a + two combining marks is one character once NFC.
    expect(first(requiredText(1).safeParse("ầ"))).toBeNull();
    expect(first(requiredText(3).safeParse("abcd"))).toBe("tooLong");
  });

  it("asks for required text and lets optional text be blank", () => {
    expect(first(requiredText(10).safeParse("   "))).toBe("required");
    expect(first(optionalText(10).safeParse("   "))).toBeNull();
  });

  it("refuses a phone number in both", () => {
    expect(first(requiredText(100).safeParse("call 0905 123 456"))).toBe("phone");
    expect(first(optionalText(100).safeParse("call 0905 123 456"))).toBe("phone");
  });
});

describe("durations (BR-4)", () => {
  it("offers 15..480 in steps of 15", () => {
    expect(DURATIONS[0]).toBe(15);
    expect(DURATIONS.at(-1)).toBe(480);
    expect(DURATIONS).toHaveLength(32);
  });

  it("reads only those values", () => {
    expect(durationOf("90")).toBe(90);
    for (const value of ["", "0", "10", "495", "60.0", "1e2"]) expect(durationOf(value)).toBeNull();
  });
});

describe("startWindowProblem (BR-4)", () => {
  const now = Date.parse("2026-10-23T02:00:30Z");

  it("takes the current minute up to 90 days after it", () => {
    expect(startWindowProblem(Date.parse("2026-10-23T02:00:00Z"), now)).toBeNull();
    expect(startWindowProblem(Date.parse("2026-10-23T01:59:00Z"), now)).toBe("tooEarly");
    expect(startWindowProblem(Date.parse("2027-01-21T02:00:00Z"), now)).toBeNull();
    expect(startWindowProblem(Date.parse("2027-01-21T02:01:00Z"), now)).toBe("tooLate");
  });
});

describe("basis dates (A-25)", () => {
  it("reads real dates only", () => {
    expect(isIsoDate("2026-10-23")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("23/10/2026")).toBe(false);
  });

  it("is not after today and not before the earliest day", () => {
    expect(basisDateProblem("", "2026-10-23")).toBe("required");
    expect(basisDateProblem("2026-10-24", "2026-10-23")).toBe("tooLate");
    expect(basisDateProblem("2026-10-20", "2026-10-23", "2026-10-21")).toBe("tooEarly");
    expect(basisDateProblem("2026-10-21", "2026-10-23", "2026-10-21")).toBeNull();
  });
});
