import type { BrokerageAgreementTerminationRequest, IntroducedBySunvibe, TerminationType, WithdrawalChannel } from "../types";

import type { EligibilityKey } from "./reason-text";
import { serverFieldErrors, withinStopTextBound } from "./suspension-form";

/**
 * The termination form without JSX (brokerage-agreement S8-D5): the type, then that type's fields. Every value is
 * private (BR-17): it lives in the form and the one request only.
 */
export type TerminationValues = {
  type: TerminationType | "";
  reportedOn: string;
  channel: WithdrawalChannel | "";
  introducedBySunvibe: IntroducedBySunvibe | "";
  note: string;
};

export const EMPTY_TERMINATION_VALUES: TerminationValues = { type: "", reportedOn: "", channel: "", introducedBySunvibe: "", note: "" };

export type TerminationField = "type" | "reportedOn" | "channel" | "introducedBySunvibe" | "note";

/** The earliest date a report may name (S8-D5); the latest is today in Vietnam. */
export const EARLIEST_REPORTED_ON = "2000-01-01";

// The calendar date in Vietnam as `yyyy-MM-dd`: the form the date input and the server read (E05S8-P10).
const VIETNAM_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

/**
 * Today in Vietnam (brokerage-agreement E05S8-P10): the dialog's first value and the date input's `max`. Input help
 * only: the server stays the judge of the date (S8-D5), and the page derives no state from a clock.
 */
export function vietnamToday(now: Date): string {
  return VIETNAM_DATE.format(now);
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date `yyyy-MM-dd` (no 2026-13-01), so the string order is the date order. */
function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value);
  if (match === null) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

const reportedOnOk = (reportedOn: string, today: string) =>
  isCalendarDate(reportedOn) && reportedOn >= EARLIEST_REPORTED_ON && reportedOn <= today;

/**
 * The browser's checks of a termination (S8-D5, E05S8-P5, E05S8-P10), only on the chosen type's fields: a type chosen;
 * for the owner's withdrawal and a let unit the date (2000-01-01 to `today`, today in Vietnam) and the channel or the
 * introduced answer; for Sunvibe's decision a note that is not blank. Every note at most 500 characters as sent; a blank
 * optional note, sent as null, is not counted. The character rule is the server's: its 400 names the field.
 */
export function terminationErrors(values: TerminationValues, today: string): Partial<Record<TerminationField, EligibilityKey>> {
  const errors: Partial<Record<TerminationField, EligibilityKey>> = {};
  const { type, reportedOn, channel, introducedBySunvibe, note } = values;
  if (type === "") return { type: "stop.fieldErrors.type" };
  if (type === "SUNVIBE_TERMINATED") {
    if (note.trim() === "" || !withinStopTextBound(note)) errors.note = "stop.fieldErrors.sunvibeNote";
    return errors;
  }
  if (!reportedOnOk(reportedOn, today)) errors.reportedOn = "stop.fieldErrors.reportedOn";
  if (type === "OWNER_WITHDREW" && channel === "") errors.channel = "stop.fieldErrors.channel";
  if (type === "UNIT_LET" && introducedBySunvibe === "") errors.introducedBySunvibe = "stop.fieldErrors.introducedBySunvibe";
  if (note.trim() !== "" && !withinStopTextBound(note)) errors.note = "stop.fieldErrors.note";
  return errors;
}

/** An optional note as sent: null when blank, else as typed (the server trims it, S8-D5). */
const optionalNote = (note: string): string | null => (note.trim() === "" ? null : note);

/**
 * The one request of a termination (S8-D5): the type and exactly that type's fields, so no field of another type is
 * sent (the server refuses one); a blank optional note as null; every text as typed. Built after the checks pass.
 */
export function terminationBody(values: TerminationValues & { type: TerminationType }): BrokerageAgreementTerminationRequest {
  switch (values.type) {
    case "OWNER_WITHDREW":
      return {
        type: values.type,
        reportedOn: values.reportedOn,
        channel: values.channel === "" ? null : values.channel,
        note: optionalNote(values.note),
      };
    case "UNIT_LET":
      return {
        type: values.type,
        reportedOn: values.reportedOn,
        introducedBySunvibe: values.introducedBySunvibe === "" ? null : values.introducedBySunvibe,
        note: optionalNote(values.note),
      };
    case "SUNVIBE_TERMINATED":
      return { type: values.type, note: values.note };
  }
}

const TERMINATION_SERVER_TEXT: Record<TerminationField, EligibilityKey> = {
  type: "stop.fieldErrors.type",
  reportedOn: "stop.fieldErrors.reportedOn",
  channel: "stop.fieldErrors.channel",
  introducedBySunvibe: "stop.fieldErrors.introducedBySunvibe",
  note: "stop.fieldErrors.badText",
};

/** The fields of a server 400, as the termination form shows them (by field, never by message). */
export const terminationServerErrors = (fields: readonly string[]) => serverFieldErrors(fields, TERMINATION_SERVER_TEXT);
