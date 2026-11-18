import { describe, expect, it } from "vitest";

import type { BrokerageAgreementDetail, BrokerageAgreementFeePolicy, BrokerageAgreementVersion } from "../types";

import { activationModel } from "./activation-model";

const STATEMENT = {
  version: "brokerage-activation-2026-11",
  text: "I compared every term of version 2 with the signed document.",
};

const feePolicy = (formula: BrokerageAgreementFeePolicy["formula"]): BrokerageAgreementFeePolicy => ({
  payer: "OWNER",
  chargedWhen: "LEASE_SIGNED",
  formula,
  dueDays: 0,
  renewal: { type: "NOT_CHARGED", tiers: [], amount: null, currency: null, freeReason: null },
  earlyLeaseEnd: { type: "NO_REFUND", refundPercent: null, withinMonths: null },
  protectionDays: 90,
});

const FIXED: BrokerageAgreementFeePolicy["formula"] = {
  type: "FIXED_AMOUNT",
  tiers: [],
  amount: 2000000,
  currency: "VND",
  freeReason: null,
};

const REJECTED_V1: BrokerageAgreementVersion = {
  versionNo: 1,
  status: "OWNER_REJECTED",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  sentAt: "2026-11-10T03:15:00Z",
  ownerAnsweredAt: "2026-11-11T03:15:00Z",
  activateBy: null,
};

const CONFIRMED_V2: BrokerageAgreementVersion = {
  versionNo: 2,
  status: "OWNER_CONFIRMED",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  sentAt: "2026-11-16T03:15:00Z",
  answerBy: "2026-11-23T03:15:00Z",
  ownerAnsweredAt: "2026-11-17T03:15:00Z",
  activateBy: "2026-12-01T03:15:00Z",
  feePolicy: feePolicy(FIXED),
};

const DETAIL: BrokerageAgreementDetail = {
  agreementId: "A1",
  status: "AWAITING_CONFIRMATION",
  transactionType: "LONG_TERM_RENT",
  unitCode: "P101",
  basisLeadId: "L1",
  dataVersion: 7,
  versions: [CONFIRMED_V2, REJECTED_V1],
  activationStatement: STATEMENT,
  viewerMayDecideActivation: true,
};

const withFormula = (formula: BrokerageAgreementFeePolicy["formula"]): BrokerageAgreementDetail => ({
  ...DETAIL,
  versions: [{ ...CONFIRMED_V2, feePolicy: feePolicy(formula) }, REJECTED_V1],
});

describe("activationModel (brokerage-agreement E05-S6, S6-D8, S6-D22, UF-1, UF-3)", () => {
  it("activationModel_awaiting_decideOrWaiting: a manager who may decide gets the section with the confirmed version and the statement; anyone else the waiting line", () => {
    expect(activationModel(DETAIL)).toEqual({
      kind: "decide",
      versionNo: 2,
      confirmedAt: "2026-11-17T03:15:00Z",
      activateBy: "2026-12-01T03:15:00Z",
      statementVersion: "brokerage-activation-2026-11",
      statementText: STATEMENT.text,
      freeFee: null,
    });
    for (const viewerMayDecideActivation of [false, undefined]) {
      expect(activationModel({ ...DETAIL, viewerMayDecideActivation })).toEqual({
        kind: "waiting",
        activateBy: "2026-12-01T03:15:00Z",
      });
    }
    // A version without the owner's answer time cannot be described to a manager: the waiting line only.
    expect(activationModel({ ...DETAIL, versions: [{ ...CONFIRMED_V2, ownerAnsweredAt: null }] })).toEqual({
      kind: "waiting",
      activateBy: "2026-12-01T03:15:00Z",
    });
    // The latest OWNER_CONFIRMED version by number, if the answer held more.
    const v3 = { ...CONFIRMED_V2, versionNo: 3, activateBy: "2026-12-05T03:15:00Z" };
    expect(activationModel({ ...DETAIL, versions: [v3, CONFIRMED_V2] })).toMatchObject({ versionNo: 3, activateBy: v3.activateBy });
  });

  it("activationModel_freeFee_checkLineWithReason: a FREE fee formula gives the check line with its reason, or none when blank or absent", () => {
    expect(
      activationModel(withFormula({ type: "FREE", tiers: [], amount: null, currency: null, freeReason: "First unit with Sunvibe" })),
    ).toMatchObject({ kind: "decide", freeFee: { reason: "First unit with Sunvibe" } });
    for (const freeReason of [null, "", "   ", undefined]) {
      expect(activationModel(withFormula({ type: "FREE", tiers: [], amount: null, currency: null, freeReason }))).toMatchObject({
        freeFee: { reason: null },
      });
    }
  });

  it("activationModel_otherFee_noCheckLine: a percentage, a fixed amount or no fee policy gives no check line", () => {
    expect(
      activationModel(withFormula({ type: "PERCENT_OF_RENT", tiers: [{ fromMonths: 12, percent: 50 }], amount: null, currency: null, freeReason: null })),
    ).toMatchObject({ kind: "decide", freeFee: null });
    expect(activationModel(withFormula(FIXED))).toMatchObject({ kind: "decide", freeFee: null });
    expect(activationModel({ ...DETAIL, versions: [{ ...CONFIRMED_V2, feePolicy: undefined }] })).toMatchObject({
      kind: "decide",
      freeFee: null,
    });
  });

  it("activationModel_missingStatementOrVersion_none: no statement, a blank statement, no confirmed version or one without activateBy gives no section and no waiting line", () => {
    const none: BrokerageAgreementDetail[] = [
      { ...DETAIL, activationStatement: undefined },
      { ...DETAIL, activationStatement: null },
      { ...DETAIL, activationStatement: { ...STATEMENT, version: "  " } },
      { ...DETAIL, activationStatement: { text: STATEMENT.text } },
      { ...DETAIL, activationStatement: { ...STATEMENT, text: "" } },
      { ...DETAIL, versions: [REJECTED_V1] },
      { ...DETAIL, versions: [{ ...CONFIRMED_V2, status: "AWAITING_OWNER" }] },
      { ...DETAIL, versions: [{ ...CONFIRMED_V2, activateBy: null }] },
      { ...DETAIL, versions: [{ ...CONFIRMED_V2, activateBy: undefined }] },
      { ...DETAIL, versions: undefined },
    ];
    for (const detail of none) expect(activationModel(detail)).toBeNull();
  });
});
