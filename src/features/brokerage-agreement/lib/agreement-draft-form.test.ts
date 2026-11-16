import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { draftBody, draftProblems, latestEndDate } from "./agreement-draft-form";

const period = (startDate: string, endDate: string) => draftProblems({ startDate, endDate });

describe("agreement draft form (brokerage-agreement E05-S2, BR-6)", () => {
  it("draftProblems_missingDates_required: an empty date is required, per field", () => {
    expect(period("", "")).toEqual({ startDate: "required", endDate: "required" });
    expect(period("2027-01-01", "")).toEqual({ endDate: "required" });
  });

  it("draftProblems_endBeforeStart_endDate: an end before the start is the end date's problem", () => {
    expect(period("2027-01-02", "2027-01-01")).toEqual({ endDate: "endBeforeStart" });
  });

  it("draftProblems_twelveMonths_boundaries: the end is at most 12 months after the start, as plusMonths(12)", () => {
    for (const [start, end] of [
      ["2027-01-01", "2027-01-01"],
      ["2027-01-01", "2028-01-01"],
      ["2028-02-29", "2029-02-28"],
      ["2026-01-31", "2027-01-31"],
    ]) {
      expect(period(start, end)).toEqual({});
    }
    expect(period("2027-01-01", "2028-01-02")).toEqual({ endDate: "tooLong" });
    expect(period("2028-02-29", "2029-03-01")).toEqual({ endDate: "tooLong" });
  });

  it("draftProblems_outsideTheCentury_outOfRange: a date before 2000 or after 2099 is out of range", () => {
    expect(period("1999-12-31", "2000-06-01")).toEqual({ startDate: "outOfRange" });
    expect(period("2099-06-01", "2100-01-01")).toEqual({ endDate: "outOfRange" });
    expect(period("not-a-date", "2027-01-01")).toEqual({ startDate: "outOfRange" });
  });

  it("latestEndDate_leapDayAndMonthEnds_asPlusMonths: one year later, the day clamped to the month's last day", () => {
    expect(latestEndDate("2028-02-29")).toBe("2029-02-28");
    expect(latestEndDate("2026-01-31")).toBe("2027-01-31");
    expect(latestEndDate("2027-12-31")).toBe("2028-12-31");
  });

  it("draftBody_values_longTermRentRequest: the request holds the lead, the unit, long-term rental and the dates", () => {
    expect(draftBody({ startDate: "2027-01-01", endDate: "2027-12-31" }, "L1", "U1")).toStrictEqual({
      leadId: "L1",
      unitId: "U1",
      transactionType: "LONG_TERM_RENT",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
    });
  });

  it("draftMessages_everyKey_hasItsEnglishText: the draft's keys read their English texts", () => {
    const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });
    const table: [Parameters<typeof t>[0], string][] = [
      ["eligibility.draft", "Draft an agreement"],
      ["eligibility.inProgress", "Agreement in progress"],
      ["eligibility.inProgressNote", "This unit already has an agreement in progress."],
      ["eligibility.openAgreement", "Open the agreement"],
      ["draft.title", "Draft an agreement"],
      ["draft.startDate", "Start date"],
      ["draft.endDate", "End date"],
      ["draft.periodHint", "The end date is at most 12 months after the start date."],
      ["draft.submit", "Create the draft"],
      ["draft.cancel", "Cancel"],
      ["draft.errors.required", "Enter a date."],
      ["draft.errors.endBeforeStart", "The end date cannot be before the start date."],
      ["draft.errors.tooLong", "The end date is more than 12 months after the start date."],
      ["draft.errors.outOfRange", "Use a date from 2000 to 2099."],
      ["draft.errors.notEligible", "This unit cannot get an agreement now:"],
      ["draft.errors.exists", "This unit already has an agreement in progress."],
      ["draft.errors.notAssignee", "Only the Sale assigned to this lead drafts an agreement."],
      ["draft.errors.notFound", "This lead is no longer available to you."],
      ["draft.errors.conflict", "Something changed at the same time. Try again."],
      ["draft.errors.failed", "The draft could not be created."],
      ["transactionType.LONG_TERM_RENT", "Long-term rental"],
      ["transactionType.OTHER", "Another transaction type"],
    ];
    for (const [key, text] of table) expect(t(key)).toBe(text);
    expect(t("draft.unit", { code: "P101" })).toBe("Unit: P101");
    expect(t("draft.transactionType", { type: t("transactionType.LONG_TERM_RENT") })).toBe(
      "Transaction type: Long-term rental",
    );
  });
});
