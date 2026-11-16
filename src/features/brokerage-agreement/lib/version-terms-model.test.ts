import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementSurveyTerms, BrokerageAgreementVersion } from "../types";

import { type Phrase, phraseText, proposalRows, type VersionContent, versionContent } from "./version-terms-model";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });
const text = (phrase: Phrase | null) => (phrase === null ? null : phraseText(t, phrase));

/** The version of spec section 4's example, as the detail answers it after the save. */
const FULL: BrokerageAgreementVersion = {
  versionNo: 1,
  status: "DRAFT",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  createdAt: "2026-11-20T03:15:00Z",
  advertisingScope: "SUNVIBE_CHANNELS",
  photoConsent: true,
  exteriorPhotoConsent: false,
  terms: {
    monthlyRent: { amount: 8000000, currency: "VND", unit: "MONTH" },
    deposit: { basis: "MONTHS", months: 2, amount: null, currency: null },
    minimumTermMonths: 12,
    paymentPeriodMonths: 1,
    mandatoryFees: [
      { name: "Electricity", basis: "AMOUNT", amount: 3500, currency: "VND", chargeUnit: "PER_KWH" },
      { name: "Water", basis: "PROVIDER_TARIFF", amount: null, currency: null, chargeUnit: null },
    ],
  },
};

const BARE: BrokerageAgreementVersion = { versionNo: 1, status: "DRAFT", startDate: "2027-01-01", endDate: "2027-12-31" };

/** Every line of a content as its English text, in the panel's order. */
function lines(content: VersionContent) {
  return {
    advertising: text(content.advertising),
    interior: text(content.interior),
    exterior: text(content.exterior),
    monthlyRent: text(content.monthlyRent),
    deposit: text(content.deposit),
    minimumTerm: text(content.minimumTerm),
    paymentPeriod: text(content.paymentPeriod),
    fees: content.fees.kind === "list" ? content.fees.lines.map((line) => phraseText(t, line)) : content.fees.kind,
  };
}

describe("versionContent (brokerage-agreement E05-S3, BR-8, BR-9, S3-D6 to S3-D8, S3-D14)", () => {
  it("versionContent_fullTerms_phrasesOfTheSpec: the example of spec section 4 reads the texts of section 6", () => {
    expect(lines(versionContent(FULL))).toEqual({
      advertising:
        "Sunvibe may advertise this unit on sunvibe.vn and by staff sending the listing link to customers, from the start date to the end date. Outside channels such as social networks, classified sites or other platforms are not included.",
      interior: "Yes",
      exterior: "No",
      monthlyRent: "8,000,000 VND per month",
      deposit: "2 months' rent",
      minimumTerm: "12 months",
      paymentPeriod: "1 month",
      fees: ["Electricity: 3,500 VND per kWh", "Water: provider's rate"],
    });

    const other = versionContent({
      ...FULL,
      photoConsent: false,
      exteriorPhotoConsent: true,
      terms: {
        ...FULL.terms,
        deposit: { basis: "AMOUNT", months: null, amount: 3000000, currency: "VND" },
        paymentPeriodMonths: 3,
        minimumTermMonths: 1,
        mandatoryFees: [{ name: "Service fee", basis: "INCLUDED", amount: null, currency: null, chargeUnit: null }],
      },
    });
    expect(lines(other)).toMatchObject({
      interior: "No",
      exterior: "Yes",
      deposit: "3,000,000 VND",
      minimumTerm: "1 month",
      paymentPeriod: "3 months",
      fees: ["Service fee: included in the rent"],
    });
    expect(text(versionContent({ ...FULL, terms: { deposit: { basis: "MONTHS", months: 1 } } }).deposit)).toBe(
      "1 month's rent",
    );
  });

  it("versionContent_nothingEntered_notEnteredAndNotStated: a version without content reads not answered, no, not entered and not stated", () => {
    for (const version of [BARE, { ...BARE, photoConsent: null, exteriorPhotoConsent: false, terms: {} }]) {
      expect(lines(versionContent(version))).toEqual({
        advertising: null,
        interior: "Not answered yet",
        exterior: "No",
        monthlyRent: "Not entered yet",
        deposit: "Not entered yet",
        minimumTerm: "Not entered yet",
        paymentPeriod: "Not entered yet",
        fees: "notStated",
      });
    }
    expect(versionContent({ ...BARE, terms: { mandatoryFees: [] } }).fees).toEqual({ kind: "none" });
    expect(t("terms.noFees")).toBe("No mandatory fee besides the rent");
    expect(t("terms.feesNotStated")).toBe("Not stated yet");
    for (const deposit of [
      { basis: "MONTHS" as const, months: 0 },
      { basis: "AMOUNT" as const, amount: 0, currency: "VND" as const },
    ]) {
      expect(text(versionContent({ ...BARE, terms: { deposit } }).deposit)).toBe("No deposit");
    }
  });

  it("versionContent_notYetAnswered_proposedLine: a DRAFT or AWAITING_OWNER version reads as proposed terms", () => {
    expect(versionContent(FULL).proposed).toBe(true);
    expect(versionContent({ ...FULL, status: "AWAITING_OWNER" }).proposed).toBe(true);
    for (const status of [
      "OWNER_CONFIRMED",
      "ACTIVATED",
      "EFFECTIVE",
      "SUPERSEDED",
      "OWNER_REJECTED",
      "LAPSED",
      "ACTIVATION_REFUSED",
      "CANCELLED",
    ] as const) {
      expect(versionContent({ ...FULL, status }).proposed).toBe(false);
    }
    expect(versionContent({ ...FULL, status: undefined }).proposed).toBe(false);
    expect(t("terms.proposed")).toBe("Proposed terms: not confirmed by the owner yet.");
  });

  it("versionContent_unreadablePart_noLine: a part the answer holds but cannot be read gives no line, never a guess", () => {
    const content = versionContent({
      ...FULL,
      terms: {
        monthlyRent: { currency: "VND", unit: "MONTH" },
        deposit: { basis: "MONTHS", months: null },
        mandatoryFees: [
          { basis: "INCLUDED" },
          { name: "", basis: "INCLUDED" },
          { name: "Parking", basis: "AMOUNT", amount: null, currency: null, chargeUnit: "PER_MONTH" },
          { name: "Gas", basis: "AMOUNT", amount: 100, currency: "VND", chargeUnit: null },
          { name: "Water", basis: "PROVIDER_TARIFF" },
        ],
      },
    });

    expect(content.monthlyRent).toBeNull();
    expect(content.deposit).toBeNull();
    expect(versionContent({ ...FULL, terms: { deposit: { basis: "AMOUNT", amount: null } } }).deposit).toBeNull();
    expect(versionContent({ ...FULL, terms: { deposit: {} } }).deposit).toBeNull();
    expect(lines(content).fees).toEqual(["Water: provider's rate"]);
  });

  it("versionContent_unknownCodes_otherTexts: an unknown scope, deposit basis, fee basis or charge unit reads its OTHER text", () => {
    const content = versionContent({
      ...FULL,
      advertisingScope: "SOCIAL_NETWORKS" as never,
      terms: {
        deposit: { basis: "BANK_GUARANTEE" as never, months: null, amount: null },
        mandatoryFees: [
          { name: "Cleaning", basis: "WAIVED" as never },
          { name: "Gas", basis: "AMOUNT", amount: 100, currency: "VND", chargeUnit: "PER_WEEK" as never },
        ],
      },
    });

    expect(text(content.advertising)).toBe("Another advertising permission.");
    expect(text(content.deposit)).toBe("Another kind of deposit");
    expect(lines(content).fees).toEqual(["Cleaning: another kind of fee", "Gas: 100 VND per another unit"]);
  });
});

describe("proposalRows (brokerage-agreement E05-S3, S3-D11 to S3-D13)", () => {
  it("proposalRows_sourcesAndDates: each part the survey holds with its value, source text and calendar date", () => {
    const proposal: BrokerageAgreementSurveyTerms = {
      terms: {
        monthlyRent: { amount: 8000000, currency: "VND", unit: "MONTH" },
        deposit: null,
        minimumTermMonths: null,
        paymentPeriodMonths: 1,
        mandatoryFees: [
          { name: "Electricity", basis: "AMOUNT", amount: 3500, currency: "VND", chargeUnit: "PER_KWH" },
          { name: "Internet", basis: "INCLUDED", amount: null, currency: null, chargeUnit: null },
        ],
      },
      sources: [
        { field: "monthlyRent", source: "OWNER_STATED", date: "2026-11-10" },
        { field: "paymentPeriodMonths", source: "OBSERVED_ON_SITE", date: "2026-11-09" },
        { field: "mandatoryFees[0]", source: "OBSERVED_ON_SITE", date: "2026-11-09" },
        { field: "mandatoryFees[1]", source: null, date: "2026-11-08" },
      ],
    };

    const rows = proposalRows(proposal).map((row) => ({
      label: t(row.labelKey),
      value: phraseText(t, row.value),
      source: t(row.sourceKey),
      date: row.dateText,
    }));

    expect(rows).toEqual([
      { label: "Monthly rent", value: "8,000,000 VND per month", source: "Said by the owner", date: "10 Nov 2026" },
      { label: "Pay every", value: "1 month", source: "Seen on site", date: "9 Nov 2026" },
      { label: "Mandatory fees", value: "Electricity: 3,500 VND per kWh", source: "Seen on site", date: "9 Nov 2026" },
      { label: "Mandatory fees", value: "Internet: included in the rent", source: "Source not recorded", date: "8 Nov 2026" },
    ]);
    expect(proposalRows({ terms: {}, sources: [] })).toEqual([]);
    expect(proposalRows({})).toEqual([]);
  });
});
