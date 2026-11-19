import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import type { TerminationType } from "../types";

import {
  EMPTY_TERMINATION_VALUES,
  EARLIEST_REPORTED_ON,
  terminationBody,
  terminationErrors,
  terminationServerErrors,
  type TerminationValues,
  vietnamToday,
} from "./termination-form";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });

const TODAY = "2026-12-03";

/** The values once a type is chosen. */
type Chosen = TerminationValues & { type: TerminationType };

const WITHDREW: Chosen = { ...EMPTY_TERMINATION_VALUES, type: "OWNER_WITHDREW", reportedOn: "2026-12-02", channel: "PHONE_CALL" };
const LET: Chosen = { ...EMPTY_TERMINATION_VALUES, type: "UNIT_LET", reportedOn: "2026-12-02", introducedBySunvibe: "UNKNOWN" };
const SUNVIBE: Chosen = { ...EMPTY_TERMINATION_VALUES, type: "SUNVIBE_TERMINATED", note: "Repeated complaints." };

describe("termination form (brokerage-agreement E05-S8, S8-D5, E05S8-P5, E05S8-P10)", () => {
  it("vietnamToday_utcEvening_nextVietnamDate: today is the calendar date in Vietnam, already the next day in the UTC evening", () => {
    expect(vietnamToday(new Date("2026-12-02T17:30:00Z"))).toBe("2026-12-03");
    expect(vietnamToday(new Date("2026-12-02T16:59:59Z"))).toBe("2026-12-02");
  });

  it("terminationForm_checks_perType: each type's required fields; the date not after today in Vietnam nor before 2000-01-01; Sunvibe's note required and not blank; every note at most 500 characters as sent", () => {
    expect(terminationErrors(EMPTY_TERMINATION_VALUES, TODAY)).toEqual({ type: "stop.fieldErrors.type" });
    expect(t("stop.fieldErrors.type")).toBe("Choose how the agreement ended.");

    expect(terminationErrors(WITHDREW, TODAY)).toEqual({});
    expect(terminationErrors({ ...WITHDREW, reportedOn: "", channel: "" }, TODAY)).toEqual({
      reportedOn: "stop.fieldErrors.reportedOn",
      channel: "stop.fieldErrors.channel",
    });
    expect(terminationErrors(LET, TODAY)).toEqual({});
    expect(terminationErrors({ ...LET, introducedBySunvibe: "" }, TODAY)).toEqual({
      introducedBySunvibe: "stop.fieldErrors.introducedBySunvibe",
    });
    // The fields of another type are not checked: they are not sent.
    expect(terminationErrors({ ...LET, channel: "" }, TODAY)).toEqual({});

    // The date: from 2000-01-01 to today in Vietnam, both included.
    expect(EARLIEST_REPORTED_ON).toBe("2000-01-01");
    for (const reportedOn of [TODAY, EARLIEST_REPORTED_ON]) expect(terminationErrors({ ...WITHDREW, reportedOn }, TODAY)).toEqual({});
    for (const reportedOn of ["2026-12-04", "1999-12-31", "2026-13-01", "not a date"]) {
      expect(terminationErrors({ ...LET, reportedOn }, TODAY)).toEqual({ reportedOn: "stop.fieldErrors.reportedOn" });
    }
    expect(t("stop.fieldErrors.reportedOn")).toBe("Enter a date from 1 Jan 2000 to today.");

    expect(terminationErrors(SUNVIBE, TODAY)).toEqual({});
    for (const note of ["", "   "]) {
      expect(terminationErrors({ ...SUNVIBE, note }, TODAY)).toEqual({ note: "stop.fieldErrors.sunvibeNote" });
    }
    expect(t("stop.fieldErrors.sunvibeNote")).toBe("Enter the reason for Sunvibe's decision (at most 500 characters).");

    // Every note: 500 as typed accepted; 501, and 499 letters between two spaces, refused.
    for (const values of [WITHDREW, LET, SUNVIBE]) {
      expect(terminationErrors({ ...values, note: "a".repeat(500) }, TODAY)).toEqual({});
      for (const note of ["a".repeat(501), ` ${"a".repeat(499)} `]) {
        expect(terminationErrors({ ...values, note }, TODAY).note).toBe(
          values.type === "SUNVIBE_TERMINATED" ? "stop.fieldErrors.sunvibeNote" : "stop.fieldErrors.note",
        );
      }
    }
    // A blank optional note is sent as null, so not counted.
    expect(terminationErrors({ ...WITHDREW, note: " ".repeat(600) }, TODAY)).toEqual({});
  });

  it("terminationForm_body_onlyTheTypeFields: the body holds the type and exactly that type's fields, a blank optional note as null, every text as typed", () => {
    expect(terminationBody({ ...WITHDREW, introducedBySunvibe: "YES", note: "  Sold.  " })).toStrictEqual({
      type: "OWNER_WITHDREW",
      reportedOn: "2026-12-02",
      channel: "PHONE_CALL",
      note: "  Sold.  ",
    });
    expect(terminationBody({ ...LET, channel: "EMAIL", note: "   " })).toStrictEqual({
      type: "UNIT_LET",
      reportedOn: "2026-12-02",
      introducedBySunvibe: "UNKNOWN",
      note: null,
    });
    expect(terminationBody({ ...SUNVIBE, reportedOn: "2026-12-02", channel: "EMAIL", introducedBySunvibe: "NO" })).toStrictEqual({
      type: "SUNVIBE_TERMINATED",
      note: "Repeated complaints.",
    });
  });

  it("terminationForm_serverEntries_fieldErrors: a server 400 names the form's fields; a refused note reads its character rule", () => {
    expect(terminationServerErrors(["note"])).toEqual({ errors: { note: "stop.fieldErrors.badText" }, other: false });
    expect(terminationServerErrors(["reportedOn", "channel"])).toEqual({
      errors: { reportedOn: "stop.fieldErrors.reportedOn", channel: "stop.fieldErrors.channel" },
      other: false,
    });
    expect(terminationServerErrors(["type", "introducedBySunvibe"])).toEqual({
      errors: { type: "stop.fieldErrors.type", introducedBySunvibe: "stop.fieldErrors.introducedBySunvibe" },
      other: false,
    });
    expect(terminationServerErrors(["somethingElse"])).toEqual({ errors: {}, other: true });
  });
});
