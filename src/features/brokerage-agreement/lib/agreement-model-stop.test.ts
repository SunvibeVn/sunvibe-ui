import { describe, expect, it } from "vitest";

import type { BrokerageAgreementDetail } from "../types";

import { agreementAfter } from "./agreement-model";
import { stopModel } from "./stop-model";

const DETAIL: BrokerageAgreementDetail = {
  agreementId: "A1",
  status: "ACTIVE",
  transactionType: "LONG_TERM_RENT",
  unitId: "U1",
  unitCode: "P101",
  basisLeadId: "L1",
  createdAt: "2026-11-20T03:15:00Z",
  dataVersion: 9,
  versions: [{ versionNo: 1, status: "EFFECTIVE", startDate: "2027-01-01", endDate: "2027-12-31" }],
};

function readyOf(detail: BrokerageAgreementDetail) {
  const model = agreementAfter({ ok: true, status: 200, replayed: false, data: detail });
  if (model.kind !== "ready") throw new Error(`expected a ready model, got ${model.kind}`);
  return model;
}

describe("agreementAfter, the stop key (brokerage-agreement E05-S8, spec section 6, UF-1)", () => {
  it("agreementModel_stopData_stopKey: an answer with an action, an end or a suspension holds the stop model", () => {
    const withAction: BrokerageAgreementDetail = { ...DETAIL, viewerStopActions: ["SUSPEND", "TERMINATE_SUNVIBE"] };
    expect(readyOf(withAction).stop).toEqual(stopModel(withAction));
    expect(readyOf(withAction).stop?.actions.suspend).toBe(true);

    const ended: BrokerageAgreementDetail = { ...DETAIL, status: "CANCELLED", endedAt: "2026-12-01T03:00:00Z", viewerStopActions: [] };
    expect(readyOf(ended).stop?.lines).toHaveLength(1);

    const suspended: BrokerageAgreementDetail = {
      ...DETAIL,
      status: "SUSPENDED",
      suspensions: [{ reasonType: "DISPUTE", suspendedAt: "2027-03-01T03:00:00Z", releasedAt: null }],
    };
    expect(Object.hasOwn(readyOf(suspended), "stop")).toBe(true);
  });

  it("agreementModel_noStopData_noStopKey: an answer with no action, no end and no suspension holds no stop key", () => {
    expect(Object.hasOwn(readyOf(DETAIL), "stop")).toBe(false);
    const empty = readyOf({ ...DETAIL, viewerStopActions: [], endedAt: null, termination: null, suspensions: [], moreSuspensions: false });
    expect(Object.hasOwn(empty, "stop")).toBe(false);
  });
});
