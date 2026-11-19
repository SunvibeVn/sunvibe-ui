import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementDetail, BrokerageAgreementVersion } from "../types";

import { agreementAfter } from "./agreement-model";
import { phraseText, type Translate } from "./version-terms-model";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" }) as unknown as Translate;

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

const EFFECTIVE: BrokerageAgreementVersion = {
  versionNo: 2,
  status: "EFFECTIVE",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  createdAt: "2026-11-20T03:15:00Z",
  sentAt: "2026-11-17T03:15:00Z",
  ownerAnsweredAt: "2026-11-17T05:00:00Z",
  activation: ACTIVATED_RECORD,
};

const DETAIL: BrokerageAgreementDetail = {
  agreementId: "A1",
  status: "ACTIVE",
  transactionType: "LONG_TERM_RENT",
  unitId: "U1",
  unitCode: "P101",
  basisLeadId: "L1",
  createdAt: "2026-11-20T03:15:00Z",
  dataVersion: 9,
  versions: [EFFECTIVE],
};

function readyOf(detail: BrokerageAgreementDetail) {
  const model = agreementAfter({ ok: true, status: 200, replayed: false, data: detail });
  if (model.kind !== "ready") throw new Error(`expected a ready model, got ${model.kind}`);
  return model;
}

describe("agreementAfter, the texts of an ended agreement (brokerage-agreement E05-S8, S8-D16, E05S8-P11, UF-5)", () => {
  it("agreementModel_effectiveVersionOfEndedAgreement_endedBadgeAndLine: the EFFECTIVE version of an EXPIRED or TERMINATED agreement reads Ended with the agreement and In effect until the agreement ended; of any other agreement today's texts", () => {
    for (const status of ["EXPIRED", "TERMINATED"] as const) {
      const [row] = readyOf({ ...DETAIL, status }).versions;
      expect(t(row!.statusKey)).toBe("Ended with the agreement");
      expect(row!.activation?.first).toEqual({ key: "versionActivation.ended" });
      expect(phraseText(t, row!.activation!.first!)).toBe("In effect until the agreement ended.");
      // The document line stays.
      expect(row!.activation?.document).toMatchObject({ key: "versionActivation.document" });
    }
    for (const status of ["ACTIVE", "SUSPENDED", "CANCELLED", "DRAFTING"] as const) {
      const [row] = readyOf({ ...DETAIL, status }).versions;
      expect(row!.statusKey).toBe("versionStatus.EFFECTIVE");
      expect(row!.activation?.first).toEqual({ key: "versionActivation.effective" });
    }
    // A cancelled version of a terminated agreement keeps its own badge.
    const [cancelled] = readyOf({ ...DETAIL, status: "TERMINATED", versions: [{ ...EFFECTIVE, status: "CANCELLED" }] }).versions;
    expect(cancelled!.statusKey).toBe("versionStatus.CANCELLED");
  });

  it("agreementModel_terminatedEndedGroup_hasEndedLine: the ENDED line of a TERMINATED or CANCELLED agreement reads that the agreement has ended; of an EXPIRED, SUSPENDED or ACTIVE one the period's end date", () => {
    const advertising = { allowed: false, reasonGroups: ["ENDED" as const], endDate: "2027-12-31" };
    for (const status of ["TERMINATED", "CANCELLED"] as const) {
      const model = readyOf({ ...DETAIL, status, advertising });
      expect(model.advertising).toEqual({ allowed: false, lines: [{ key: "advertising.reasons.ENDED" }] });
    }
    for (const status of ["EXPIRED", "SUSPENDED", "ACTIVE"] as const) {
      const model = readyOf({ ...DETAIL, status, advertising });
      expect(model.advertising).toEqual({ allowed: false, lines: [{ key: "advertising.endedOn", values: { date: "31 Dec 2027" } }] });
    }
    // An answer without a state reads it as unknown: the agreement has ended.
    expect(readyOf({ ...DETAIL, status: undefined, advertising }).advertising).toEqual({ allowed: false, lines: [{ key: "advertising.reasons.ENDED" }] });
  });
});
