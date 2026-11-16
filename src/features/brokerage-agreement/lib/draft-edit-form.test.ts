import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementSurveyTerms, BrokerageAgreementVersion } from "../types";

import {
  type DraftEditForm,
  draftEditBody,
  draftEditProblems,
  type FeeRow,
  fieldOfServerPath,
  formFromVersion,
  formWithProposal,
  MAX_FEES,
  problemKey,
  withFee,
  withFeeAdded,
  withFeeRemoved,
  withValue,
} from "./draft-edit-form";

/** The version of spec section 4's example, as the detail answers it. */
const FULL: BrokerageAgreementVersion = {
  versionNo: 1,
  status: "DRAFT",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
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

const ELECTRICITY: FeeRow = { name: "Electricity", basis: "AMOUNT", amount: "3500", chargeUnit: "PER_KWH", fromSurvey: null };
const WATER: FeeRow = { name: "Water", basis: "PROVIDER_TARIFF", amount: "", chargeUnit: "", fromSurvey: null };

/** The form of FULL. */
const VALID: DraftEditForm = {
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  photoConsent: "yes",
  exteriorPhotoConsent: false,
  monthlyRent: "8000000",
  depositBasis: "MONTHS",
  depositMonths: "2",
  depositAmount: "",
  minimumTermMonths: "12",
  paymentPeriodMonths: "1",
  fees: { kind: "list", rows: [ELECTRICITY, WATER] },
  fromSurvey: {},
};

const EMPTY: DraftEditForm = {
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  photoConsent: "unanswered",
  exteriorPhotoConsent: false,
  monthlyRent: "",
  depositBasis: "",
  depositMonths: "",
  depositAmount: "",
  minimumTermMonths: "",
  paymentPeriodMonths: "",
  fees: { kind: "notStated" },
  fromSurvey: {},
};

const row = (patch: Partial<FeeRow>): FeeRow => ({ ...ELECTRICITY, ...patch });
const withRows = (rows: FeeRow[]): DraftEditForm => ({ ...VALID, fees: { kind: "list", rows } });

describe("the draft edit form's values (brokerage-agreement E05-S3, S3-D5, S3-D13, E05S3-P7)", () => {
  it("formFromVersion_storedContent_formValues: the stored content becomes the form's first values, numbers as text", () => {
    expect(formFromVersion(FULL)).toEqual(VALID);
    expect(
      formFromVersion({
        ...FULL,
        photoConsent: false,
        terms: { deposit: { basis: "AMOUNT", months: null, amount: 3000000, currency: "VND" }, mandatoryFees: [] },
      }),
    ).toMatchObject({
      photoConsent: "no",
      depositBasis: "AMOUNT",
      depositMonths: "",
      depositAmount: "3000000",
      monthlyRent: "",
      fees: { kind: "none" },
    });
  });

  it("formFromVersion_nothingEntered_emptyValues: a version without content reads not answered, unchecked and empty", () => {
    expect(formFromVersion({ versionNo: 1, status: "DRAFT", startDate: "2027-01-01", endDate: "2027-12-31" })).toEqual(EMPTY);
    expect(
      formFromVersion({ ...FULL, photoConsent: null, exteriorPhotoConsent: false, terms: { mandatoryFees: null } }),
    ).toEqual(EMPTY);
  });

  it("formWithProposal_fillsHeldPartsKeepsOthers: the parts the survey holds replace those parts with their notes; the others stay", () => {
    const proposal: BrokerageAgreementSurveyTerms = {
      terms: {
        monthlyRent: { amount: 9000000, currency: "VND", unit: "MONTH" },
        deposit: null,
        minimumTermMonths: 6,
        paymentPeriodMonths: 3,
        mandatoryFees: [{ name: "Internet", basis: "INCLUDED", amount: null, currency: null, chargeUnit: null }],
      },
      sources: [
        { field: "monthlyRent", source: "OWNER_STATED", date: "2026-11-10" },
        { field: "minimumTermMonths", source: null, date: "2026-11-09" },
        { field: "paymentPeriodMonths", source: "OBSERVED_ON_SITE", date: "2026-11-09" },
        { field: "mandatoryFees[0]", source: "OWNER_FORM", date: "2026-11-08" },
      ],
    };

    const form = formWithProposal({ ...VALID, depositBasis: "AMOUNT", depositMonths: "", depositAmount: "5000000" }, proposal);

    expect(form).toEqual({
      ...VALID,
      depositBasis: "AMOUNT",
      depositMonths: "",
      depositAmount: "5000000",
      monthlyRent: "9000000",
      minimumTermMonths: "6",
      paymentPeriodMonths: "3",
      fees: {
        kind: "list",
        rows: [
          {
            name: "Internet",
            basis: "INCLUDED",
            amount: "",
            chargeUnit: "",
            fromSurvey: { sourceKey: "survey.source.OWNER_FORM", dateText: "8 Nov 2026" },
          },
        ],
      },
      fromSurvey: {
        monthlyRent: { sourceKey: "survey.source.OWNER_STATED", dateText: "10 Nov 2026" },
        minimumTermMonths: { sourceKey: "survey.source.none", dateText: "9 Nov 2026" },
        paymentPeriodMonths: { sourceKey: "survey.source.OBSERVED_ON_SITE", dateText: "9 Nov 2026" },
      },
    });

    // A deposit and fees the survey holds; an empty proposal changes nothing.
    const deposit = formWithProposal(EMPTY, {
      terms: { deposit: { basis: "AMOUNT", months: null, amount: 0, currency: "VND" }, mandatoryFees: null },
      sources: [{ field: "deposit", source: "OWNER_STATED", date: "2026-11-10" }],
    });
    expect(deposit).toMatchObject({ depositBasis: "AMOUNT", depositAmount: "0", fees: { kind: "notStated" } });
    expect(deposit.fromSurvey.deposit).toEqual({ sourceKey: "survey.source.OWNER_STATED", dateText: "10 Nov 2026" });
    expect(formWithProposal(VALID, { terms: {}, sources: [] })).toEqual(VALID);
  });

  it("withValue_changedPart_dropsItsSurveyNote: changing a part drops its note and keeps the others", () => {
    const note = { sourceKey: "survey.source.OWNER_STATED" as const, dateText: "10 Nov 2026" };
    const noted: DraftEditForm = {
      ...VALID,
      fromSurvey: { monthlyRent: note, deposit: note, minimumTermMonths: note, paymentPeriodMonths: note },
    };

    expect(withValue(noted, "monthlyRent", "8500000")).toMatchObject({
      monthlyRent: "8500000",
      fromSurvey: { deposit: note, minimumTermMonths: note, paymentPeriodMonths: note },
    });
    expect(withValue(noted, "monthlyRent", "8500000").fromSurvey.monthlyRent).toBeUndefined();
    for (const key of ["depositBasis", "depositMonths", "depositAmount"] as const) {
      expect(withValue(noted, key, key === "depositBasis" ? "AMOUNT" : "1").fromSurvey.deposit).toBeUndefined();
    }
    expect(withValue(noted, "minimumTermMonths", "1").fromSurvey.minimumTermMonths).toBeUndefined();
    expect(withValue(noted, "paymentPeriodMonths", "2").fromSurvey.paymentPeriodMonths).toBeUndefined();
    expect(withValue(noted, "startDate", "2027-02-01").fromSurvey).toEqual(noted.fromSurvey);

    const notedFee = withRows([{ ...WATER, fromSurvey: note }]);
    expect(withFee(notedFee, 0, { name: "Water and drainage" }).fees).toEqual({
      kind: "list",
      rows: [{ ...WATER, name: "Water and drainage", fromSurvey: null }],
    });
  });

  it("withValue_consentNotYes_clearsExterior: an exterior consent holds only beside Yes for the interior", () => {
    const both = withValue(VALID, "exteriorPhotoConsent", true);
    expect(both.exteriorPhotoConsent).toBe(true);
    expect(withValue(both, "photoConsent", "no")).toMatchObject({ photoConsent: "no", exteriorPhotoConsent: false });
    expect(withValue(both, "photoConsent", "unanswered")).toMatchObject({ exteriorPhotoConsent: false });
    expect(withValue({ ...VALID, photoConsent: "no" }, "exteriorPhotoConsent", true).exteriorPhotoConsent).toBe(false);
  });

  it("withFeeAdded_twentyRows_noMore: a fee is added up to twenty and removed by its place", () => {
    let form: DraftEditForm = { ...VALID, fees: { kind: "notStated" } };
    form = withFeeAdded(form);
    expect(form.fees).toEqual({
      kind: "list",
      rows: [{ name: "", basis: "AMOUNT", amount: "", chargeUnit: "", fromSurvey: null }],
    });
    for (let count = 1; count < 25; count += 1) form = withFeeAdded(form);
    expect(form.fees.kind === "list" ? form.fees.rows : []).toHaveLength(MAX_FEES);

    const two = withRows([ELECTRICITY, WATER]);
    expect(withFeeRemoved(two, 0).fees).toEqual({ kind: "list", rows: [WATER] });
  });
});

describe("the draft edit form's checks (brokerage-agreement BR-8, BR-9, BR-6, S3-D7, S3-D8)", () => {
  it("draftEditProblems_termBounds_fieldProblems: each value beyond a bound is refused on its field; the bounds pass", () => {
    const cases: [DraftEditForm, Record<string, string>][] = [
      [{ ...VALID, monthlyRent: "0" }, { monthlyRent: "amount" }],
      [{ ...VALID, monthlyRent: "8,000,000" }, { monthlyRent: "amount" }],
      [{ ...VALID, monthlyRent: "8000000.5" }, { monthlyRent: "amount" }],
      [{ ...VALID, monthlyRent: "1000000000000000" }, { monthlyRent: "amount" }],
      [{ ...VALID, depositMonths: "13" }, { depositMonths: "depositMonths" }],
      [{ ...VALID, depositBasis: "AMOUNT", depositAmount: "-1" }, { depositAmount: "depositAmount" }],
      [{ ...VALID, minimumTermMonths: "0" }, { minimumTermMonths: "minimumTerm" }],
      [{ ...VALID, minimumTermMonths: "121" }, { minimumTermMonths: "minimumTerm" }],
      [{ ...VALID, paymentPeriodMonths: "0" }, { paymentPeriodMonths: "paymentPeriod" }],
      [{ ...VALID, paymentPeriodMonths: "13" }, { paymentPeriodMonths: "paymentPeriod" }],
      [withRows([row({ name: "" })]), { "fees.0.name": "feeName" }],
      [withRows([row({ name: "   " })]), { "fees.0.name": "feeName" }],
      [withRows([WATER, row({ name: "x".repeat(101) })]), { "fees.1.name": "feeName" }],
      [withRows([row({ name: "Gas\u0000" })]), { "fees.0.name": "feeName" }],
      [withRows([row({ name: "Gas\u0007bill" })]), { "fees.0.name": "feeName" }],
      [withRows([row({ amount: "" })]), { "fees.0.amount": "feeAmount" }],
      [withRows([row({ amount: "0" })]), { "fees.0.amount": "feeAmount" }],
      [withRows([row({ chargeUnit: "" })]), { "fees.0.chargeUnit": "feeUnit" }],
      [withRows(Array.from({ length: 21 }, () => WATER)), { fees: "tooManyFees" }],
      // Several problems at once are each shown on their field.
      [
        { ...withRows([row({ name: "", amount: "0" })]), monthlyRent: "0", depositMonths: "13" },
        { monthlyRent: "amount", depositMonths: "depositMonths", "fees.0.name": "feeName", "fees.0.amount": "feeAmount" },
      ],
    ];
    for (const [form, problems] of cases) expect(draftEditProblems(form)).toEqual(problems);

    const accepted: DraftEditForm[] = [
      VALID,
      EMPTY,
      { ...VALID, monthlyRent: "1", depositMonths: "0", minimumTermMonths: "1", paymentPeriodMonths: "1" },
      { ...VALID, monthlyRent: "999999999999999", depositMonths: "12", minimumTermMonths: "120", paymentPeriodMonths: "12" },
      { ...VALID, depositBasis: "AMOUNT", depositAmount: "0" },
      { ...VALID, depositBasis: "AMOUNT", depositAmount: "999999999999999" },
      { ...VALID, depositBasis: "MONTHS", depositMonths: "", depositAmount: "-1" },
      withRows([]),
      withRows(Array.from({ length: 20 }, () => WATER)),
      withRows([row({ name: "x".repeat(100), amount: "1" }), row({ name: "  Gas  ", amount: "999999999999999" })]),
      withRows([{ ...WATER, basis: "INCLUDED" }]),
      { ...VALID, fees: { kind: "none" } },
    ];
    for (const form of accepted) expect(draftEditProblems(form)).toEqual({});
  });

  it("draftEditProblems_periodRules_asTheCreateDialog: the period is checked as the draft dialog checks it", () => {
    expect(draftEditProblems({ ...VALID, startDate: "", endDate: "" })).toEqual({ startDate: "required", endDate: "required" });
    expect(draftEditProblems({ ...VALID, startDate: "1999-12-31" })).toEqual({ startDate: "outOfRange" });
    expect(draftEditProblems({ ...VALID, endDate: "2026-12-31" })).toEqual({ endDate: "endBeforeStart" });
    expect(draftEditProblems({ ...VALID, endDate: "2028-01-02" })).toEqual({ endDate: "tooLong" });
    expect(draftEditProblems({ ...VALID, startDate: "2028-02-29", endDate: "2029-03-01" })).toEqual({ endDate: "tooLong" });
    expect(draftEditProblems({ ...VALID, startDate: "2028-02-29", endDate: "2029-02-28" })).toEqual({});
  });
});

describe("the draft request (brokerage-agreement E05-S3, spec section 4, S3-D5)", () => {
  it("draftEditBody_consentAndTypes_asTheContract: the form of the example sends the example's body with the page's data version", () => {
    expect(draftEditBody(VALID, 0)).toStrictEqual({
      expectedDataVersion: 0,
      transactionType: "LONG_TERM_RENT",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
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
    });

    expect(draftEditBody(EMPTY, 7)).toStrictEqual({
      expectedDataVersion: 7,
      transactionType: "LONG_TERM_RENT",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      photoConsent: null,
      exteriorPhotoConsent: false,
      terms: { monthlyRent: null, deposit: null, minimumTermMonths: null, paymentPeriodMonths: null, mandatoryFees: null },
    });

    const no = draftEditBody({ ...VALID, photoConsent: "no", exteriorPhotoConsent: true }, 1);
    expect([no.photoConsent, no.exteriorPhotoConsent]).toEqual([false, false]);
    const yes = draftEditBody({ ...VALID, exteriorPhotoConsent: true }, 1);
    expect([yes.photoConsent, yes.exteriorPhotoConsent]).toEqual([true, true]);

    expect(draftEditBody({ ...VALID, depositBasis: "AMOUNT", depositAmount: "0" }, 1).terms.deposit).toStrictEqual({
      basis: "AMOUNT",
      months: null,
      amount: 0,
      currency: "VND",
    });
    // A basis chosen without its value is not entered yet.
    expect(draftEditBody({ ...VALID, depositMonths: "" }, 1).terms.deposit).toBeNull();
    expect(draftEditBody({ ...VALID, depositBasis: "" }, 1).terms.deposit).toBeNull();
  });

  it("draftEditBody_feeStates_nullEmptyOrRows: not stated sends null, none [], a list its rows trimmed", () => {
    expect(draftEditBody({ ...VALID, fees: { kind: "notStated" } }, 0).terms.mandatoryFees).toBeNull();
    expect(draftEditBody({ ...VALID, fees: { kind: "none" } }, 0).terms.mandatoryFees).toStrictEqual([]);
    expect(
      draftEditBody(
        withRows([
          row({ name: "  Gas  ", amount: "120000", chargeUnit: "PER_MONTH" }),
          { ...WATER, basis: "INCLUDED", amount: "10", chargeUnit: "PER_M3" },
        ]),
        0,
      ).terms.mandatoryFees,
    ).toStrictEqual([
      { name: "Gas", basis: "AMOUNT", amount: 120000, currency: "VND", chargeUnit: "PER_MONTH" },
      { name: "Water", basis: "INCLUDED", amount: null, currency: null, chargeUnit: null },
    ]);
  });

  it("draftEditBody_largestAmounts_exactSafeIntegers: the largest amounts are sent exactly, as integers with VND", () => {
    const body = draftEditBody(
      {
        ...withRows([row({ amount: "999999999999999" })]),
        monthlyRent: "999999999999999",
        depositBasis: "AMOUNT",
        depositAmount: "999999999999999",
      },
      0,
    );
    const rent = body.terms.monthlyRent;
    const deposit = body.terms.deposit;
    const fee = body.terms.mandatoryFees?.[0];

    for (const part of [rent, deposit, fee]) {
      expect(part?.amount).toBe(999999999999999);
      expect(Number.isSafeInteger(part?.amount)).toBe(true);
      expect(part?.currency).toBe("VND");
    }
    const json = JSON.stringify(body);
    expect(json.match(/999999999999999/g)).toHaveLength(3);
    expect(json).not.toMatch(/e\+|999999999999999\.|1000000000000000/);
  });

  it("fieldOfServerPath_termsPaths_formFields: each field path of a 400 marks its form field", () => {
    const table: [string, string | null][] = [
      ["startDate", "startDate"],
      ["endDate", "endDate"],
      ["exteriorPhotoConsent", "exteriorPhotoConsent"],
      ["terms.monthlyRent.amount", "monthlyRent"],
      ["terms.monthlyRent.currency", "monthlyRent"],
      ["terms.monthlyRent.unit", "monthlyRent"],
      ["terms.deposit.basis", "depositBasis"],
      ["terms.deposit.months", "depositMonths"],
      ["terms.deposit.amount", "depositAmount"],
      ["terms.deposit.currency", "depositAmount"],
      ["terms.minimumTermMonths", "minimumTermMonths"],
      ["terms.paymentPeriodMonths", "paymentPeriodMonths"],
      ["terms.mandatoryFees", "fees"],
      ["terms.mandatoryFees[2].amount", "fees.2.amount"],
      ["terms.mandatoryFees[0].currency", "fees.0.amount"],
      ["terms.mandatoryFees[13].name", "fees.13.name"],
      ["terms.mandatoryFees[1].basis", "fees.1.basis"],
      ["terms.mandatoryFees[1].chargeUnit", "fees.1.chargeUnit"],
      ["expectedDataVersion", null],
      ["transactionType", null],
      ["terms.mandatoryFees[x].name", null],
      ["terms.unknown", null],
      ["photoConsent", null],
    ];
    for (const [path, field] of table) expect(fieldOfServerPath(path)).toBe(field);
  });

  it("draftEditMessages_everyKey_hasItsEnglishText: each problem and refusal reads its English text", () => {
    const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" });
    const problems: [Parameters<typeof problemKey>[0], string][] = [
      ["required", "Enter a date."],
      ["outOfRange", "Use a date from 2000 to 2099."],
      ["endBeforeStart", "The end date cannot be before the start date."],
      ["tooLong", "The end date is more than 12 months after the start date."],
      ["amount", "Enter a whole number of VND from 1, without separators."],
      ["depositMonths", "Enter a number of months from 0 to 12."],
      ["depositAmount", "Enter a whole number of VND from 0, without separators."],
      ["minimumTerm", "Enter a number of months from 1 to 120."],
      ["paymentPeriod", "Enter a number of months from 1 to 12."],
      ["feeName", "Enter a name of 1 to 100 characters."],
      ["feeAmount", "Enter a whole number of VND from 1, without separators."],
      ["feeUnit", "Choose a unit."],
      ["tooManyFees", "A draft holds at most 20 fees."],
    ];
    for (const [problem, text] of problems) expect(t(problemKey(problem))).toBe(text);

    const refusals: [Parameters<typeof t>[0], string][] = [
      ["edit.errors.notEligible", "This draft cannot be saved now:"],
      ["edit.errors.notDraft", "This version is no longer a draft."],
      ["edit.errors.stale", "This draft changed since you opened it."],
      ["edit.errors.notAssignee", "Only the Sale assigned to this lead edits the draft."],
      ["edit.errors.notFound", "This agreement is not available."],
      ["edit.errors.failed", "The draft could not be saved."],
    ];
    for (const [key, text] of refusals) expect(t(key)).toBe(text);
  });
});

describe("the fee policy's server paths (brokerage-agreement E05-S4, S4-D14, spec section 6)", () => {
  it("draftEditForm_feePolicyServerPaths_markTheSection: every feePolicy path of a 400 marks the fee section, the E05-S3 paths as before", () => {
    for (const path of [
      "feePolicy",
      "feePolicy.formula.tiers[0].fromMonths",
      "feePolicy.renewal.tiers[2].percent",
      "feePolicy.renewal.type",
      "feePolicy.protectionDays",
      "feePolicy.formula.currency",
      "feePolicy.earlyLeaseEnd.withinMonths",
    ]) {
      expect(fieldOfServerPath(path)).toBe("feePolicy");
    }
    for (const path of ["feePolicyX", "feePolicies.dueDays", "terms.feePolicy"]) expect(fieldOfServerPath(path)).toBeNull();
    expect(fieldOfServerPath("terms.mandatoryFees[2].amount")).toBe("fees.2.amount");
  });
});
