import type { SuspensionReasonType } from "../types";

import type { EligibilityKey } from "./reason-text";

/**
 * The bound of every free text of the stops (brokerage-agreement S8-D5, S8-D6, E05S8-P5): the server bounds the text
 * as sent, before it trims it, so the page counts the value as its body sends it, in UTF-16 units as `String.length`
 * and the server's `@Size` count them. A text the page lets through is never refused for its length.
 */
export const STOP_TEXT_MAX = 500;

/** A text as the body sends it is within the bound: the value as typed, untrimmed. */
export const withinStopTextBound = (text: string): boolean => text.length <= STOP_TEXT_MAX;

/** The suspension form without JSX (S8-D6): one of four reasons and an optional note, private values (BR-17). */
export type SuspensionValues = { reasonType: SuspensionReasonType | ""; note: string };

export const EMPTY_SUSPENSION_VALUES: SuspensionValues = { reasonType: "", note: "" };

export type SuspensionField = "reasonType" | "note";

/**
 * The browser's checks of a suspension: a reason chosen; a note that is not blank at most 500 characters as sent (a
 * blank note is sent as null, so not counted). The character rule is the server's: its 400 names the note.
 */
export function suspensionErrors(values: SuspensionValues): Partial<Record<SuspensionField, EligibilityKey>> {
  const errors: Partial<Record<SuspensionField, EligibilityKey>> = {};
  if (values.reasonType === "") errors.reasonType = "stop.fieldErrors.reasonType";
  if (values.note.trim() !== "" && !withinStopTextBound(values.note)) errors.note = "stop.fieldErrors.note";
  return errors;
}

export type ReleaseField = "reason";

/** The browser's check of the release reason (S8-D6): required, not blank, and at most 500 characters as sent. */
export function releaseErrors(reason: string): Partial<Record<ReleaseField, EligibilityKey>> {
  return reason.trim() === "" || !withinStopTextBound(reason) ? { reason: "stop.fieldErrors.releaseReason" } : {};
}

/** The fields a server 400 named, as the form shows them; `other` when it named a field the form does not hold. */
export type ServerFieldErrors<F extends string> = { errors: Partial<Record<F, EligibilityKey>>; other: boolean };

/**
 * Reads the fields of a server 400 against the form's own (by field, never by message): a text the browser already
 * bounded is refused for its characters; a code the form offers reads its choice error.
 */
export function serverFieldErrors<F extends string>(
  fields: readonly string[],
  table: Readonly<Record<F, EligibilityKey>>,
): ServerFieldErrors<F> {
  const errors: Partial<Record<F, EligibilityKey>> = {};
  let other = false;
  for (const field of fields) {
    if (Object.hasOwn(table, field)) errors[field as F] = table[field as F];
    else other = true;
  }
  return { errors, other };
}

const SUSPENSION_SERVER_TEXT: Record<SuspensionField, EligibilityKey> = {
  reasonType: "stop.fieldErrors.reasonType",
  note: "stop.fieldErrors.badText",
};

export const suspensionServerErrors = (fields: readonly string[]) => serverFieldErrors(fields, SUSPENSION_SERVER_TEXT);

const RELEASE_SERVER_TEXT: Record<ReleaseField, EligibilityKey> = { reason: "stop.fieldErrors.badText" };

export const releaseServerErrors = (fields: readonly string[]) => serverFieldErrors(fields, RELEASE_SERVER_TEXT);
