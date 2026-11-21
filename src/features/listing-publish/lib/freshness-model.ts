import type { ApiResult } from "@/features/auth/client";

import type { ListingFreshness, ListingFreshnessRecord } from "../types";

import { channelKey, outcomeKey } from "./freshness-text";
import type { ListingKey } from "./revision-text";

/** A Vietnam calendar date (`YYYY-MM-DD`) as the page shows it, formatted in UTC so the day never shifts. */
const CALENDAR_DATE = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** The latest record as the panel shows it; the note is the Sale's private text, shown as text only. */
export type FreshnessLatestLine = {
  date: string;
  channelKey: ListingKey;
  outcomeKey: ListingKey;
  /** The two answers of BR-9, for "Still available" only. */
  answers: { termsStillApply: boolean; unitUnchanged: boolean } | null;
  valid: boolean;
  note: string | null;
  /** The latest result is "No longer available": the prompt to record E05's termination (E06S3-D11). */
  prompt: boolean;
};

/**
 * The freshness panel (spec section 6, E06S3-D8). `hidden`: a session answer, which shows nothing (E06S1-P8);
 * `not-found`: the one 404, after which the page reads the listing again; `empty`: no record yet; `ready`: the dates of
 * the latest valid confirmation (null before one), the two flags and the latest record.
 */
export type FreshnessPanelModel =
  | { kind: "error" }
  | { kind: "not-found" }
  | { kind: "hidden" }
  | { kind: "empty" }
  | {
      kind: "ready";
      confirmedOn: string | null;
      reconfirmFrom: string | null;
      validThrough: string | null;
      reconfirmationDue: boolean;
      deadlinePassed: boolean;
      latest: FreshnessLatestLine;
    };

export function formatCalendarDate(date: string): string {
  return CALENDAR_DATE.format(new Date(`${date}T00:00:00Z`));
}

function dateOrNull(date: string | null): string | null {
  return date === null ? null : formatCalendarDate(date);
}

function latestLine(record: ListingFreshnessRecord): FreshnessLatestLine {
  const answered = record.outcome === "AVAILABLE" && record.termsStillApply !== null && record.unitUnchanged !== null;
  return {
    date: formatCalendarDate(record.contactDate),
    channelKey: channelKey(record.channel),
    outcomeKey: outcomeKey(record.outcome),
    answers: answered ? { termsStillApply: record.termsStillApply === true, unitUnchanged: record.unitUnchanged === true } : null,
    valid: record.valid,
    note: record.note,
    prompt: record.outcome === "NOT_AVAILABLE",
  };
}

/** The panel's model from the freshness read. */
export function freshnessPanelModel(result: ApiResult<ListingFreshness>): FreshnessPanelModel {
  if (result.ok) {
    const freshness = result.data;
    if (freshness.latest === null) return { kind: "empty" };
    return {
      kind: "ready",
      confirmedOn: dateOrNull(freshness.confirmedOn),
      reconfirmFrom: dateOrNull(freshness.reconfirmFrom),
      validThrough: dateOrNull(freshness.validThrough),
      reconfirmationDue: freshness.reconfirmationDue,
      deadlinePassed: freshness.deadlinePassed,
      latest: latestLine(freshness.latest),
    };
  }
  switch (result.kind) {
    case "signed-out":
    case "unavailable":
      return { kind: "hidden" };
    case "network":
      return { kind: "error" };
    case "http":
      return result.status === 404 ? { kind: "not-found" } : { kind: "error" };
  }
}
