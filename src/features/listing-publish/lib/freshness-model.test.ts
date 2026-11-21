import { afterEach, describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ListingFreshness, ListingFreshnessRecord } from "../types";

import { formatCalendarDate, freshnessPanelModel } from "./freshness-model";

const LISTING_ID = "01JG000000000000000000000L";

/** A valid confirmation on 2027-03-01 (listing-publish BR-10's example), read after its deadline. */
const VALID_RECORD: ListingFreshnessRecord = {
  contactDate: "2027-03-01",
  recordedAt: "2027-03-01T02:10:00Z",
  channel: "CALL",
  outcome: "AVAILABLE",
  termsStillApply: true,
  unitUnchanged: true,
  valid: true,
  note: "Chủ xác nhận còn trống.\nGọi lại sau.",
};

const FRESHNESS: ListingFreshness = {
  listingId: LISTING_ID,
  confirmedOn: "2027-03-01",
  reconfirmFrom: "2027-03-11",
  validThrough: "2027-03-15",
  reconfirmationDue: true,
  deadlinePassed: true,
  latest: VALID_RECORD,
};

const answered = (data: ListingFreshness): ApiResult<ListingFreshness> => ({ ok: true, status: 200, replayed: false, data });

describe("freshness panel model (listing-publish E06-S3, spec section 6, E06S3-D8, D14)", () => {
  const zone = process.env.TZ;
  afterEach(() => {
    process.env.TZ = zone;
  });

  it("freshnessModel_noRecord_emptyState: no record yet is the empty state", () => {
    expect(
      freshnessPanelModel(
        answered({
          listingId: LISTING_ID,
          confirmedOn: null,
          reconfirmFrom: null,
          validThrough: null,
          reconfirmationDue: false,
          deadlinePassed: false,
          latest: null,
        }),
      ),
    ).toEqual({ kind: "empty" });
  });

  it("freshnessModel_validLatest_datesAndBadges: the three dates formatted, both flags, the latest record with its answers and its note", () => {
    expect(freshnessPanelModel(answered(FRESHNESS))).toEqual({
      kind: "ready",
      confirmedOn: "Mar 1, 2027",
      reconfirmFrom: "Mar 11, 2027",
      validThrough: "Mar 15, 2027",
      reconfirmationDue: true,
      deadlinePassed: true,
      latest: {
        date: "Mar 1, 2027",
        channelKey: "freshness.channels.CALL",
        outcomeKey: "freshness.outcomes.AVAILABLE",
        answers: { termsStillApply: true, unitUnchanged: true },
        valid: true,
        note: "Chủ xác nhận còn trống.\nGọi lại sau.",
        prompt: false,
      },
    });
  });

  it("freshnessModel_invalidLatest_notValidLine: a negative answer is a record that is not valid, the earlier confirmation's dates kept", () => {
    expect(
      freshnessPanelModel(
        answered({
          ...FRESHNESS,
          reconfirmationDue: false,
          deadlinePassed: false,
          latest: { ...VALID_RECORD, contactDate: "2027-03-05", unitUnchanged: false, valid: false, note: null },
        }),
      ),
    ).toEqual({
      kind: "ready",
      confirmedOn: "Mar 1, 2027",
      reconfirmFrom: "Mar 11, 2027",
      validThrough: "Mar 15, 2027",
      reconfirmationDue: false,
      deadlinePassed: false,
      latest: {
        date: "Mar 5, 2027",
        channelKey: "freshness.channels.CALL",
        outcomeKey: "freshness.outcomes.AVAILABLE",
        answers: { termsStillApply: true, unitUnchanged: false },
        valid: false,
        note: null,
        prompt: false,
      },
    });
  });

  it("freshnessModel_notAvailable_promptShown: a latest record 'No longer available' shows the prompt, with no answers", () => {
    expect(
      freshnessPanelModel(
        answered({
          ...FRESHNESS,
          confirmedOn: null,
          reconfirmFrom: null,
          validThrough: null,
          reconfirmationDue: false,
          deadlinePassed: false,
          latest: {
            ...VALID_RECORD,
            channel: "IN_PERSON",
            outcome: "NOT_AVAILABLE",
            termsStillApply: null,
            unitUnchanged: null,
            valid: false,
            note: null,
          },
        }),
      ),
    ).toEqual({
      kind: "ready",
      confirmedOn: null,
      reconfirmFrom: null,
      validThrough: null,
      reconfirmationDue: false,
      deadlinePassed: false,
      latest: {
        date: "Mar 1, 2027",
        channelKey: "freshness.channels.IN_PERSON",
        outcomeKey: "freshness.outcomes.NOT_AVAILABLE",
        answers: null,
        valid: false,
        note: null,
        prompt: true,
      },
    });
  });

  it("freshnessModel_notFound_notFoundKind: a 404 is not found, another failure an error, a session answer hidden", () => {
    const failures: ApiResult<ListingFreshness>[] = [
      { ok: false, kind: "http", status: 404, code: "NOT_FOUND", fieldErrors: [] },
      { ok: false, kind: "http", status: 500, code: "INTERNAL_ERROR", fieldErrors: [] },
      { ok: false, kind: "network" },
      { ok: false, kind: "signed-out" },
    ];
    expect(failures.map(freshnessPanelModel)).toEqual([{ kind: "not-found" }, { kind: "error" }, { kind: "error" }, { kind: "hidden" }]);
  });

  it("formatCalendarDate_anyZone_dayNeverShifts: a Vietnam calendar date reads the same day in every zone", () => {
    const shown = ["Asia/Ho_Chi_Minh", "America/Los_Angeles", "UTC"].map((name) => {
      process.env.TZ = name;
      return formatCalendarDate("2027-03-01");
    });
    expect(shown).toEqual(["Mar 1, 2027", "Mar 1, 2027", "Mar 1, 2027"]);
  });
});
