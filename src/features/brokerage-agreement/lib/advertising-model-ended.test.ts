import { describe, expect, it } from "vitest";

import type { BrokerageAgreementAdvertising } from "../types";

import { advertisingModel } from "./advertising-model";

const ENDED: BrokerageAgreementAdvertising = { allowed: false, reasonGroups: ["ENDED", "OWNER"], endDate: "2027-12-31" };

describe("advertisingModel by the agreement's state (brokerage-agreement E05-S8, S8-D16, UF-5)", () => {
  it("advertisingModel_state_passedToTheEndedLine: the state given reaches the ENDED line; without one the line is today's", () => {
    expect(advertisingModel(ENDED, "TERMINATED")).toEqual({
      allowed: false,
      lines: [{ key: "advertising.reasons.ENDED" }, { key: "eligibility.reasons.OWNER" }],
    });
    expect(advertisingModel(ENDED, null)).toEqual({
      allowed: false,
      lines: [{ key: "advertising.reasons.ENDED" }, { key: "eligibility.reasons.OWNER" }],
    });
    for (const state of ["EXPIRED", undefined]) {
      expect(advertisingModel(ENDED, state)).toEqual({
        allowed: false,
        lines: [{ key: "advertising.endedOn", values: { date: "31 Dec 2027" } }, { key: "eligibility.reasons.OWNER" }],
      });
    }
    expect(advertisingModel(ENDED)).toEqual(advertisingModel(ENDED, undefined));
    // An allowed answer does not read the state.
    const allowed: BrokerageAgreementAdvertising = { allowed: true, reasonGroups: [], endDate: "2027-12-31" };
    expect(advertisingModel(allowed, "TERMINATED")).toEqual(advertisingModel(allowed));
  });
});
