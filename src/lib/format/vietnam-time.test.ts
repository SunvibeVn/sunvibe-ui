import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatLocalInput,
  instantToLocalInput,
  localInputToInstant,
  vietnamDate,
} from "./vietnam-time";

describe("formatDateTime (BR-5, W11-44)", () => {
  it("shows dd/MM/yyyy HH:mm in Vietnam time", () => {
    expect(formatDateTime("2026-10-18T02:05:00Z")).toBe("18/10/2026 09:05");
  });

  it("rolls over to the next day at 17:00 UTC", () => {
    expect(formatDateTime("2026-12-31T17:30:00Z")).toBe("01/01/2027 00:30");
  });

  it("reads an offset instant", () => {
    expect(formatDateTime("2026-10-18T09:05:00+07:00")).toBe("18/10/2026 09:05");
  });

  it("does not depend on the machine time zone", () => {
    const saved = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      expect(formatDateTime("2026-10-18T02:05:00Z")).toBe("18/10/2026 09:05");
      process.env.TZ = "Pacific/Auckland";
      expect(formatDateTime("2026-10-18T02:05:00Z")).toBe("18/10/2026 09:05");
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });

  it("returns an empty string for an unreadable value", () => {
    expect(formatDateTime("nope")).toBe("");
  });
});

describe("formatDate", () => {
  it("shows a date-only value as dd/MM/yyyy without shifting it", () => {
    expect(formatDate("2026-10-18")).toBe("18/10/2026");
    expect(formatDate("2026-01-05")).toBe("05/01/2026");
  });

  it("returns an empty string for an unreadable value", () => {
    expect(formatDate("18/10/2026")).toBe("");
  });

  it("takes a date only: a date-time or trailing text is unreadable, not cut", () => {
    expect(formatDate("2026-10-18T09:05:00Z")).toBe("");
    expect(formatDate("2026-10-18 junk")).toBe("");
  });
});

describe("datetime-local conversion (W11-44)", () => {
  it("reads a local value as Vietnam time", () => {
    expect(localInputToInstant("2026-10-18T09:05")).toBe("2026-10-18T02:05:00.000Z");
  });

  it("crosses midnight", () => {
    expect(localInputToInstant("2026-10-18T00:30")).toBe("2026-10-17T17:30:00.000Z");
  });

  it("accepts seconds", () => {
    expect(localInputToInstant("2026-10-18T09:05:30")).toBe("2026-10-18T02:05:30.000Z");
  });

  it("rejects a malformed or impossible value", () => {
    expect(() => localInputToInstant("")).toThrow(RangeError);
    expect(() => localInputToInstant("2026-10-18")).toThrow(RangeError);
    expect(() => localInputToInstant("2026-13-18T09:05")).toThrow(RangeError);
    expect(() => localInputToInstant("2026-02-30T09:05")).toThrow(RangeError);
  });

  it("writes an instant as a Vietnam-time input value", () => {
    expect(instantToLocalInput("2026-10-18T02:05:00.000Z")).toBe("2026-10-18T09:05");
    expect(instantToLocalInput("2026-10-17T17:30:00Z")).toBe("2026-10-18T00:30");
  });

  it("round-trips", () => {
    expect(instantToLocalInput(localInputToInstant("2027-03-04T23:59"))).toBe("2027-03-04T23:59");
  });

  it("returns an empty string for an unreadable instant", () => {
    expect(instantToLocalInput("nope")).toBe("");
  });
});

describe("vietnamDate (survey-schedule A-25)", () => {
  it("is the Vietnam calendar date of an instant", () => {
    expect(vietnamDate("2026-10-23T16:59:00Z")).toBe("2026-10-23");
    expect(vietnamDate("2026-10-23T17:00:00Z")).toBe("2026-10-24");
  });

  it("does not depend on the machine time zone", () => {
    const saved = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      expect(vietnamDate("2026-10-23T17:30:00Z")).toBe("2026-10-24");
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });

  it("is empty for an unreadable instant", () => {
    expect(vietnamDate("nope")).toBe("");
  });
});

describe("formatLocalInput (survey-schedule W15-38)", () => {
  it("shows a datetime-local value as dd/MM/yyyy HH:mm, whatever format the browser draws the input in", () => {
    expect(formatLocalInput("2026-10-24T10:04")).toBe("24/10/2026 10:04");
    expect(formatLocalInput("2026-10-24T10:04:30")).toBe("24/10/2026 10:04");
  });

  it("is empty for an empty or malformed value", () => {
    expect(formatLocalInput("")).toBe("");
    expect(formatLocalInput("24/10/2026")).toBe("");
  });
});
