import { describe, expect, it } from "vitest";

import type { BrokerageAgreementDetail, BrokerageAgreementVersion } from "../types";

import { agreementAfter } from "./agreement-model";

/** The properties of an E05-S5 answer, without any of the three the detail gains in E05-S6. */
const DETAIL: BrokerageAgreementDetail = {
  agreementId: "A1",
  status: "DRAFTING",
  transactionType: "LONG_TERM_RENT",
  unitId: "U1",
  unitCode: "P101",
  basisLeadId: "L1",
  createdAt: "2026-11-20T03:15:00Z",
  versions: [
    { versionNo: 2, status: "AWAITING_OWNER", startDate: "2027-02-01", endDate: "2028-01-31", createdAt: "2026-11-21T03:15:00Z" },
    { versionNo: 1, status: "DRAFT", startDate: "2027-01-01", endDate: "2027-12-31", createdAt: "2026-11-20T03:15:00Z" },
  ],
};

const SENT: BrokerageAgreementVersion = {
  versionNo: 1,
  status: "LAPSED",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  createdAt: "2026-11-20T03:15:00Z",
  sentAt: "2026-11-17T03:15:00Z",
  answerBy: "2026-11-24T03:15:00Z",
};

const ACTIVATED_RECORD = {
  decision: "ACTIVATED",
  decidedAt: "2026-11-18T03:00:00Z",
  documentNumber: "HDMG-2026/014",
  signedOn: "2026-11-16",
  sunvibeSignatoryName: "Nguyen Van A",
  sunvibeSignatoryTitle: "Director",
  refusalType: null,
  refusalNote: null,
} as const satisfies NonNullable<BrokerageAgreementVersion["activation"]>;

const REFUSED_RECORD = {
  decision: "REFUSED",
  decidedAt: "2026-11-18T03:00:00Z",
  documentNumber: null,
  signedOn: null,
  sunvibeSignatoryName: null,
  sunvibeSignatoryTitle: null,
  refusalType: "SIGNER_NOT_OWNER",
  refusalNote: "The signature is not the owner's.",
} as const satisfies NonNullable<BrokerageAgreementVersion["activation"]>;

function readyOf(detail: BrokerageAgreementDetail) {
  const model = agreementAfter({ ok: true, status: 200, replayed: false, data: detail });
  if (model.kind !== "ready") throw new Error(`expected a ready model, got ${model.kind}`);
  return model;
}

const rowOf = (version: BrokerageAgreementVersion) => readyOf({ ...DETAIL, versions: [version] }).versions[0];

describe("agreementAfter, activation and the advertising answer (brokerage-agreement E05-S6, S6-D8, S6-D22, UF-3, UF-5)", () => {
  it("agreementModel_newProperties_keysOnlyWhenPresent: an answer without the new properties sets none of the new keys; with them it sets all three", () => {
    const today = readyOf(DETAIL);
    expect(Object.hasOwn(today, "advertising")).toBe(false);
    expect(Object.hasOwn(today, "activation")).toBe(false);
    for (const row of today.versions) expect(Object.hasOwn(row, "activation")).toBe(false);

    // A version whose activation is null holds no key either.
    const nullRecord = readyOf({ ...DETAIL, versions: [{ ...SENT, status: "OWNER_REJECTED", activation: null }] });
    expect(Object.hasOwn(nullRecord.versions[0] as object, "activation")).toBe(false);

    const withAll = readyOf({
      ...DETAIL,
      status: "AWAITING_CONFIRMATION",
      dataVersion: 7,
      versions: [
        { ...SENT, versionNo: 1, status: "ACTIVATION_REFUSED", ownerAnsweredAt: "2026-11-16T03:15:00Z", activation: REFUSED_RECORD },
        {
          ...SENT,
          versionNo: 2,
          status: "OWNER_CONFIRMED",
          ownerAnsweredAt: "2026-11-19T03:15:00Z",
          activateBy: "2026-12-03T03:15:00Z",
          activation: null,
        },
      ],
      advertising: { allowed: false, reasonGroups: ["NOT_IN_EFFECT"] },
      viewerMayDecideActivation: true,
      activationStatement: { version: "brokerage-activation-2026-11", text: "I compared every term." },
    });
    expect(withAll.advertising).toEqual({ allowed: false, lines: [{ key: "advertising.reasons.NOT_IN_EFFECT" }] });
    expect(withAll.activation).toMatchObject({ kind: "decide", versionNo: 2, activateBy: "2026-12-03T03:15:00Z" });
    expect(Object.hasOwn(withAll.versions[0] as object, "activation")).toBe(true);
    expect(Object.hasOwn(withAll.versions[1] as object, "activation")).toBe(false);

    // A statement with no version awaiting activation sets no activation key; advertising alone is still set.
    const noVersion = readyOf({
      ...DETAIL,
      advertising: { allowed: false, reasonGroups: ["NOT_IN_EFFECT"] },
      activationStatement: { version: "brokerage-activation-2026-11", text: "I compared every term." },
    });
    expect(Object.hasOwn(noVersion, "activation")).toBe(false);
    expect(Object.hasOwn(noVersion, "advertising")).toBe(true);
  });

  it("agreementModel_answerLines_notActivatedAtActivateBy: a lapsed version with activateBy was not activated by then; without it the 7-day lapse at answerBy", () => {
    expect(rowOf({ ...SENT, ownerAnsweredAt: "2026-11-19T03:15:00Z", activateBy: "2026-12-03T03:15:00Z" })?.answer).toEqual({
      kind: "notActivated",
      time: "2026-12-03T03:15:00Z",
      reasonOrNull: null,
    });
    for (const activateBy of [null, undefined, ""]) {
      expect(rowOf({ ...SENT, activateBy })?.answer).toEqual({ kind: "lapsed", time: "2026-11-24T03:15:00Z", reasonOrNull: null });
      expect(rowOf({ ...SENT, activateBy, ownerAnsweredAt: "2026-11-19T03:15:00Z" })?.answer).toEqual({
        kind: "lapsed",
        time: "2026-11-24T03:15:00Z",
        reasonOrNull: null,
      });
    }
    // A confirmed version waiting for activation keeps its confirmation line.
    expect(
      rowOf({ ...SENT, status: "OWNER_CONFIRMED", ownerAnsweredAt: "2026-11-19T03:15:00Z", activateBy: "2026-12-03T03:15:00Z" })?.answer,
    ).toEqual({ kind: "confirmed", time: "2026-11-19T03:15:00Z", reasonOrNull: null });
  });

  it("agreementModel_versionActivation_documentOrRefusalLines: an activated or effective version holds its activation and document lines; a refused one its reason and note", () => {
    const activated = rowOf({ ...SENT, status: "ACTIVATED", ownerAnsweredAt: "2026-11-17T03:15:00Z", activation: ACTIVATED_RECORD });
    expect(activated?.activation).toEqual({
      decidedAt: "2026-11-18T03:00:00Z",
      first: { key: "versionActivation.activated", values: { date: "1 Jan 2027" } },
      document: {
        key: "versionActivation.document",
        values: { number: "HDMG-2026/014", date: "16 Nov 2026", name: "Nguyen Van A", title: "Director" },
      },
      refusal: null,
      note: null,
    });

    const effective = rowOf({ ...SENT, status: "EFFECTIVE", activation: ACTIVATED_RECORD });
    expect(effective?.activation).toMatchObject({
      first: { key: "versionActivation.effective" },
      document: { key: "versionActivation.document", values: { number: "HDMG-2026/014", date: "16 Nov 2026" } },
      refusal: null,
    });

    const refused = rowOf({ ...SENT, status: "ACTIVATION_REFUSED", activation: REFUSED_RECORD });
    expect(refused?.activation).toEqual({
      decidedAt: "2026-11-18T03:00:00Z",
      first: null,
      document: null,
      refusal: { key: "versionActivation.refused", values: { reason: { key: "activation.refusal.SIGNER_NOT_OWNER" } } },
      note: "The signature is not the owner's.",
    });
    expect(
      rowOf({ ...SENT, status: "ACTIVATION_REFUSED", activation: { ...REFUSED_RECORD, refusalType: "DOCUMENT_DIFFERS" } })?.activation
        ?.refusal,
    ).toEqual({ key: "versionActivation.refused", values: { reason: { key: "activation.refusal.DOCUMENT_DIFFERS" } } });

    const unknownType = rowOf({
      ...SENT,
      status: "ACTIVATION_REFUSED",
      activation: { ...REFUSED_RECORD, refusalType: "SOMETHING_NEW" as never, refusalNote: "   " },
    });
    expect(unknownType?.activation).toMatchObject({
      refusal: { key: "versionActivation.refused", values: { reason: { key: "versionActivation.reasonOther" } } },
      note: null,
    });

    // A document value the answer leaves out: no document line, never one with an empty value.
    for (const missing of ["documentNumber", "signedOn", "sunvibeSignatoryName", "sunvibeSignatoryTitle"] as const) {
      const partial = rowOf({ ...SENT, status: "EFFECTIVE", activation: { ...ACTIVATED_RECORD, [missing]: null } });
      expect(partial?.activation).toMatchObject({ first: { key: "versionActivation.effective" }, document: null });
    }

    // No time to name: neither the first line nor the refusal line, never one with an empty time.
    const noTime = rowOf({ ...SENT, status: "ACTIVATION_REFUSED", activation: { ...REFUSED_RECORD, decidedAt: undefined } });
    expect(noTime?.activation).toMatchObject({ decidedAt: null, first: null, refusal: null });
    const noTimeActivated = rowOf({ ...SENT, status: "ACTIVATED", activation: { ...ACTIVATED_RECORD, decidedAt: undefined } });
    expect(noTimeActivated?.activation).toMatchObject({ decidedAt: null, first: null });
  });
});
