import { type FreshnessRecordInput, freshnessRecordSchema, normalizedNote } from "../schemas/freshness-record.schema";
import type { ListingFreshnessRecordRequest } from "../types";

import type { ListingKey } from "./revision-text";

export type Channel = ListingFreshnessRecordRequest["channel"];
export type Outcome = ListingFreshnessRecordRequest["outcome"];

/**
 * The record form's values (listing-publish US-6 AC-1, spec section 6): a channel, a result, the two answers of BR-9
 * for "Still available" (null until chosen, a "No" being false) and the private note as typed. No date: the server sets
 * today in Vietnam time (E06S3-D4).
 */
export type FreshnessFormValues = {
  channel: Channel | null;
  outcome: Outcome | null;
  termsStillApply: boolean | null;
  unitUnchanged: boolean | null;
  note: string;
};

export const EMPTY_FRESHNESS_FORM: FreshnessFormValues = {
  channel: null,
  outcome: null,
  termsStillApply: null,
  unitUnchanged: null,
  note: "",
};

/** "Save contact" waits until the schema the action checks accepts the values (E06S3-P13 (5)). */
export function isComplete(values: FreshnessFormValues): boolean {
  return freshnessRecordSchema.safeParse(values).success;
}

/**
 * What a record of these values does, under the results (E06S3-D11, BR-9, BR-11): "Could not reach" and "No longer
 * available" end the current confirmation, the latter with the prompt to record E05's termination; "Still available"
 * with a negative answer is not a valid confirmation. Both answers yes: no hint.
 */
export function hintKeys(values: FreshnessFormValues): ListingKey[] {
  switch (values.outcome) {
    case "UNREACHABLE":
      return ["freshness.form.hintUnreachable"];
    case "NOT_AVAILABLE":
      return ["freshness.form.hintNotAvailable", "freshness.prompt"];
    case "AVAILABLE":
      return values.termsStillApply === false || values.unitUnchanged === false ? ["freshness.form.hintNotValid"] : [];
    default:
      return [];
  }
}

/** The note's counter: code points of the NFC text as typed, as the server counts them (spec section 6). */
export function noteCount(note: string): number {
  return [...note.normalize("NFC")].length;
}

/**
 * The record's body: the two answers only for "Still available", else null; the note as typed (the server normalizes
 * it), or null when it holds nothing the server would keep.
 */
export function requestBody(input: FreshnessRecordInput, dataVersion: number): ListingFreshnessRecordRequest {
  const available = input.outcome === "AVAILABLE";
  return {
    dataVersion,
    channel: input.channel,
    outcome: input.outcome,
    termsStillApply: available ? input.termsStillApply : null,
    unitUnchanged: available ? input.unitUnchanged : null,
    note: normalizedNote(input.note) === null ? null : input.note,
  };
}
