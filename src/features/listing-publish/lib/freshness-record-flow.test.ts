import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ListingFreshnessRecorded } from "../types";

import type { FreshnessFormValues } from "./freshness-record-form";
import { type FreshnessRecordOutcome, formStateOf, listingChangeOf, runFreshnessRecord } from "./freshness-record-flow";

const LISTING_ID = "01JG000000000000000000000L";
const COMPLETE: FreshnessFormValues = { channel: "CALL", outcome: "AVAILABLE", termsStillApply: true, unitUnchanged: true, note: "" };

const recorded = (valid: boolean): ApiResult<ListingFreshnessRecorded> => ({
  ok: true,
  status: 201,
  replayed: false,
  data: { listingId: LISTING_ID, dataVersion: 5, valid },
});
const refused = (status: number, code: string): ApiResult<ListingFreshnessRecorded> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: [],
});

/** The outcome of one record whose call answers `result`. */
function outcomeOf(result: ApiResult<ListingFreshnessRecorded>) {
  return runFreshnessRecord(LISTING_ID, COMPLETE, 4, { record: vi.fn().mockResolvedValueOnce(result) });
}

describe("freshness record flow (listing-publish E06-S3, spec section 6, E06S3-P8, P13)", () => {
  it("freshnessRecordFlow_answers_mappedByCode: 201 is done with its validity; 400, 404 and the two 409 codes their refusals; anything else failed", async () => {
    expect(
      await Promise.all(
        [
          recorded(true),
          refused(400, "VALIDATION_FAILED"),
          refused(404, "NOT_FOUND"),
          refused(409, "LISTING_ARCHIVED"),
          refused(409, "CONCURRENT_MODIFICATION"),
        ].map(outcomeOf),
      ),
    ).toEqual([
      { kind: "done", valid: true },
      { kind: "refused", answer: "invalid" },
      { kind: "refused", answer: "notFound" },
      { kind: "refused", answer: "archived" },
      { kind: "refused", answer: "concurrent" },
    ]);
    expect(await outcomeOf(refused(500, "INTERNAL_ERROR"))).toEqual({ kind: "refused", answer: "failed" });
  });

  it("freshnessRecordFlow_change_byOutcome: a record, a 409 CONCURRENT_MODIFICATION and a 404 ask the page to read the listing again; nothing else does", () => {
    const asked: FreshnessRecordOutcome[] = [
      { kind: "done", valid: false },
      { kind: "refused", answer: "concurrent" },
      { kind: "refused", answer: "notFound" },
    ];
    expect(asked.map(listingChangeOf)).toEqual(["recorded", "concurrent", "gone"]);
    const others: FreshnessRecordOutcome[] = [
      { kind: "invalid", fieldErrors: { channel: "channel" } },
      { kind: "refused", answer: "invalid" },
      { kind: "refused", answer: "archived" },
      { kind: "refused", answer: "failed" },
    ];
    expect(others.map(listingChangeOf)).toEqual([null, null, null, null]);
  });

  it("freshnessRecordFlow_invalidValues_fieldErrorsNoCall: values the schema refuses answer their field errors and send nothing", async () => {
    const record = vi.fn();
    expect(await runFreshnessRecord(LISTING_ID, { ...COMPLETE, channel: null }, 4, { record })).toEqual({
      kind: "invalid",
      fieldErrors: { channel: "channel" },
    });
    expect(record).not.toHaveBeenCalled();
  });

  it("freshnessRecordFlow_formState_byOutcome: done is success, invalid values their field errors, each refusal its sentence's key", () => {
    const outcomes: FreshnessRecordOutcome[] = [
      { kind: "done", valid: true },
      { kind: "invalid", fieldErrors: { note: "noteTooLong" } },
      ...(["invalid", "notFound", "archived", "concurrent", "failed"] as const).map((answer) => ({ kind: "refused" as const, answer })),
    ];
    expect(outcomes.map(formStateOf)).toEqual([
      { status: "success" },
      { status: "error", fieldErrors: { note: "noteTooLong" } },
      { status: "error", messageKey: "freshness.answers.invalid" },
      { status: "error", messageKey: "freshness.answers.notFound" },
      { status: "error", messageKey: "freshness.answers.archived" },
      { status: "error", messageKey: "freshness.answers.concurrent" },
      { status: "error", messageKey: "freshness.answers.failed" },
    ]);
  });
});
