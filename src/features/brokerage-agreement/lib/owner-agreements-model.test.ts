import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementOwnerItem, BrokerageAgreementOwnerList, BrokerageAgreementVersion } from "../types";

import { ownerAgreementsModel } from "./owner-agreements-model";
import { versionContent } from "./version-terms-model";

const STATEMENT_1 = {
  version: "brokerage-agreement-2026-11",
  text: "Version 1 of the brokerage agreement for unit P101: I have read every term above.",
};

const SENT_V1: BrokerageAgreementVersion = {
  versionNo: 1,
  status: "AWAITING_OWNER",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  photoConsent: true,
  exteriorPhotoConsent: false,
  terms: {
    monthlyRent: { amount: 8000000, currency: "VND", unit: "MONTH" },
    deposit: null,
    minimumTermMonths: 12,
    paymentPeriodMonths: 1,
    mandatoryFees: [],
  },
  sentAt: "2026-11-17T03:15:00.123456Z",
  answerBy: "2026-11-24T03:15:00.123456Z",
  ownerAnsweredAt: null,
  ownerRejectionReason: null,
};

const ITEM: BrokerageAgreementOwnerItem = {
  agreementId: "A1",
  status: "AWAITING_CONFIRMATION",
  transactionType: "LONG_TERM_RENT",
  unitCode: "P101",
  unitLocation: "P101 · Tower A, floor 10",
  street: "12 Example Street",
  wardName: "Ward 1",
  versions: [SENT_V1],
  statement: STATEMENT_1,
};

const ok = (data: BrokerageAgreementOwnerList): ApiResult<BrokerageAgreementOwnerList> => ({
  ok: true,
  status: 200,
  replayed: false,
  data,
});

const listOf = (items: BrokerageAgreementOwnerItem[], more = false) => {
  const model = ownerAgreementsModel(ok({ items, more }));
  if (model.kind !== "list") throw new Error(`expected a list, got ${model.kind}`);
  return model;
};

describe("ownerAgreementsModel (brokerage-agreement E05-S5, S5-D17, spec section 6)", () => {
  it("ownerAgreementsModel_items_unitLocationAndVersionsNewestFirst: each agreement holds its unit line, the location lines, the type and its sent versions, newest first", () => {
    const rejected: BrokerageAgreementVersion = {
      ...SENT_V1,
      status: "OWNER_REJECTED",
      ownerAnsweredAt: "2026-11-18T01:00:00Z",
      ownerRejectionReason: "The rent is too low.",
    };
    const waiting: BrokerageAgreementVersion = {
      ...SENT_V1,
      versionNo: 2,
      sentAt: "2026-11-19T03:15:00Z",
      answerBy: "2026-11-26T03:15:00Z",
    };
    const { items, more } = listOf([{ ...ITEM, versions: [rejected, waiting] }]);

    expect(more).toBe(false);
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item).toMatchObject({
      agreementId: "A1",
      unitCode: "P101",
      unit: { key: "owner.unit", values: { code: "P101" } },
      locationLines: ["P101 · Tower A, floor 10", "12 Example Street", "Ward 1"],
      transactionTypeKey: "transactionType.LONG_TERM_RENT",
    });
    expect(item?.versions.map((version) => version.versionNo)).toEqual([2, 1]);
    expect(item?.versions[0]).toMatchObject({
      startText: "1 Jan 2027",
      endText: "31 Dec 2027",
      state: { key: "owner.state.awaiting", values: { time: "2026-11-26 10:15" } },
    });
    expect(item?.versions[1]).toMatchObject({
      state: { key: "owner.state.rejected", values: { time: "2026-11-18 08:00" } },
      reason: "The rent is too low.",
    });
  });

  it("ownerAgreementsModel_answerable_onlyWithStatement: the AWAITING_OWNER version can be answered only when the item holds a statement", () => {
    const withStatement = listOf([ITEM]).items[0]?.versions[0];
    expect(withStatement).toMatchObject({
      answerable: true,
      statementVersion: "brokerage-agreement-2026-11",
      statementText: STATEMENT_1.text,
      state: { key: "owner.state.awaiting", values: { time: "2026-11-24 10:15" } },
    });

    const withoutStatement = listOf([{ ...ITEM, statement: null }]).items[0]?.versions[0];
    expect(withoutStatement).toMatchObject({
      answerable: false,
      statementVersion: null,
      statementText: null,
      state: { key: "owner.state.handling" },
    });

    const confirmed = listOf([
      { ...ITEM, versions: [{ ...SENT_V1, status: "OWNER_CONFIRMED", ownerAnsweredAt: "2026-11-18T01:00:00Z" }] },
    ]).items[0]?.versions[0];
    expect(confirmed).toMatchObject({
      answerable: false,
      statementText: null,
      state: { key: "owner.state.confirmed", values: { time: "2026-11-18 08:00" } },
      reason: null,
    });
  });

  it("ownerAgreementsModel_twoVersions_onlyThePendingAnswerable: with version 1 declined and version 2 waiting, only version 2 can be answered and holds the statement", () => {
    const statement2 = { version: "brokerage-agreement-2026-11", text: "Version 2 of the brokerage agreement for unit P101: …" };
    const declined: BrokerageAgreementVersion = {
      ...SENT_V1,
      status: "OWNER_REJECTED",
      ownerAnsweredAt: "2026-11-18T01:00:00Z",
      ownerRejectionReason: null,
    };
    const waiting: BrokerageAgreementVersion = { ...SENT_V1, versionNo: 2, answerBy: "2026-11-26T03:15:00Z" };
    const versions = listOf([{ ...ITEM, versions: [declined, waiting], statement: statement2 }]).items[0]?.versions;

    expect(versions?.map(({ versionNo, answerable, statementText }) => ({ versionNo, answerable, statementText }))).toEqual([
      { versionNo: 2, answerable: true, statementText: statement2.text },
      { versionNo: 1, answerable: false, statementText: null },
    ]);
    expect(versions?.[1]).toMatchObject({ state: { key: "owner.state.rejected", values: { time: "2026-11-18 08:00" } }, reason: null });
  });

  it("ownerAgreementsModel_panels_notProposed: neither panel of the owner's version reads as proposed, while the shared versionContent keeps its own result", () => {
    const version = listOf([ITEM]).items[0]?.versions[0];

    expect(version?.content.proposed).toBe(false);
    expect(version?.fee.proposed).toBe(false);
    expect(version?.content.monthlyRent).toEqual({ key: "terms.rentValue", values: { amount: "8,000,000" } });
    expect(version?.fee.payer).toEqual({ key: "fee.payer.OWNER" });
    // The staff page's model is unchanged: an AWAITING_OWNER version still reads as proposed there (S4-D15).
    expect(versionContent(SENT_V1).proposed).toBe(true);
  });

  it("ownerAgreementsModel_noLocation_unitLineOnly: a unit property-service no longer answers shows its unit line and no location line, never a missing card", () => {
    const located = listOf([{ ...ITEM, unitLocation: null, street: null, wardName: null }]).items[0];
    expect(located).toMatchObject({ unit: { key: "owner.unit", values: { code: "P101" } }, locationLines: [] });
    expect(located?.versions).toHaveLength(1);

    const noCode = listOf([{ ...ITEM, unitCode: null, unitLocation: null, street: "  ", wardName: undefined }]).items[0];
    expect(noCode).toMatchObject({ unitCode: null, unit: { key: "detail.noCode" }, locationLines: [] });
  });

  it("ownerAgreementsModel_states_loadingErrorEmptyAndMore: no answer yet is loading, a failure an error with its support code, no agreement empty, more than 50 a list with more", () => {
    expect(ownerAgreementsModel(null)).toEqual({ kind: "loading" });
    expect(
      ownerAgreementsModel({ ok: false, kind: "http", status: 500, code: "INTERNAL_ERROR", fieldErrors: [], correlationId: "c-1" }),
    ).toEqual({ kind: "error", correlationId: "c-1" });
    expect(ownerAgreementsModel({ ok: false, kind: "network" })).toStrictEqual({ kind: "error" });
    // Signed out or unavailable: the session screens answer, the page keeps its loading state.
    expect(ownerAgreementsModel({ ok: false, kind: "signed-out" })).toEqual({ kind: "loading" });
    expect(ownerAgreementsModel({ ok: false, kind: "unavailable" })).toEqual({ kind: "loading" });
    expect(ownerAgreementsModel(ok({ items: [], more: false }))).toEqual({ kind: "empty" });
    expect(ownerAgreementsModel(ok({}))).toEqual({ kind: "empty" });
    expect(listOf([ITEM], true)).toMatchObject({ kind: "list", more: true });
  });
});
