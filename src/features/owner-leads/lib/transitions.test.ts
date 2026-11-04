import { describe, expect, it } from "vitest";

import { CLOSED_STATUSES, OPEN_STATUSES } from "../types";

import { allowedTargets, isClosing } from "./transitions";

describe("allowedTargets (acquisition BR-3, W11-32)", () => {
  it("NEW can only be closed", () => {
    expect(allowedTargets("NEW")).toEqual(["DUPLICATE", "REJECTED", "WITHDRAWN"]);
  });

  it("ASSIGNED can be contacted, put on hold or closed", () => {
    expect(allowedTargets("ASSIGNED")).toEqual(["CONTACTED", "ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"]);
  });

  it("CONTACTED can be put on hold or closed", () => {
    expect(allowedTargets("CONTACTED")).toEqual(["ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"]);
  });

  it("ON_HOLD can go back to CONTACTED or be closed", () => {
    expect(allowedTargets("ON_HOLD")).toEqual(["CONTACTED", "DUPLICATE", "REJECTED", "WITHDRAWN"]);
  });

  it("SURVEY_SCHEDULED can be put on hold or closed (survey-schedule B-2, BR-3)", () => {
    expect(allowedTargets("SURVEY_SCHEDULED")).toEqual(["ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"]);
  });

  it("transitions_qualifiedTargets: QUALIFIED can be put on hold or closed (survey-checklist 4.8)", () => {
    expect(allowedTargets("QUALIFIED")).toEqual(["ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"]);
  });

  it("transitions_onHoldWithPassed_closingOnly: a PASSED of the cycle leaves only the closing statuses (D3-13)", () => {
    expect(allowedTargets("ON_HOLD", { hasPassed: true, hasSubmitted: false })).toEqual([
      "DUPLICATE",
      "REJECTED",
      "WITHDRAWN",
    ]);
  });

  it("transitions_onHoldWithSubmitted_hidesContacted: a SUBMITTED revision keeps a held lead off Contacted (D3-8)", () => {
    expect(allowedTargets("ON_HOLD", { hasPassed: false, hasSubmitted: true })).not.toContain("CONTACTED");
  });

  it("keeps Contacted on a held lead without a survey record, or while the record is unknown", () => {
    expect(allowedTargets("ON_HOLD", { hasPassed: false, hasSubmitted: false })).toContain("CONTACTED");
    expect(allowedTargets("ON_HOLD", null)).toContain("CONTACTED");
  });

  it("the survey record changes only the targets of a held lead", () => {
    expect(allowedTargets("QUALIFIED", { hasPassed: true, hasSubmitted: false })).toEqual(allowedTargets("QUALIFIED"));
    expect(allowedTargets("ASSIGNED", { hasPassed: true, hasSubmitted: true })).toEqual(allowedTargets("ASSIGNED"));
  });

  it("never offers QUALIFIED: only a PASSED decision or a resume moves a lead there (survey-checklist I-4)", () => {
    for (const status of [...OPEN_STATUSES, ...CLOSED_STATUSES]) {
      expect(allowedTargets(status)).not.toContain("QUALIFIED");
    }
  });

  it("never offers SURVEY_SCHEDULED: only a survey command moves a lead there (spec 4.3)", () => {
    for (const status of [...OPEN_STATUSES, ...CLOSED_STATUSES]) {
      expect(allowedTargets(status)).not.toContain("SURVEY_SCHEDULED");
    }
  });

  it.each(CLOSED_STATUSES)("closed %s has no target", (status) => {
    expect(allowedTargets(status)).toEqual([]);
  });

  it("returns a copy that callers may mutate", () => {
    const first = allowedTargets("NEW");
    first.pop();
    expect(allowedTargets("NEW")).toHaveLength(3);
  });

  it("never offers the status itself or NEW", () => {
    for (const status of OPEN_STATUSES) {
      expect(allowedTargets(status)).not.toContain(status);
      expect(allowedTargets(status)).not.toContain("NEW");
    }
  });
});

describe("isClosing", () => {
  it.each(["DUPLICATE", "REJECTED", "WITHDRAWN"] as const)("%s closes a lead", (status) => {
    expect(isClosing(status)).toBe(true);
  });

  it.each(["NEW", "ASSIGNED", "CONTACTED", "SURVEY_SCHEDULED", "QUALIFIED", "ON_HOLD"] as const)("%s does not close a lead", (status) => {
    expect(isClosing(status)).toBe(false);
  });
});
