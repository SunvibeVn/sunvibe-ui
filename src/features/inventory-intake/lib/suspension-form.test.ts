import { describe, expect, it } from "vitest";

import type { IntakeBlock } from "../types";

import { releaseBody, releaseProblem, suspendableUnits, suspensionBody, suspensionProblem, suspensionRows } from "./suspension-form";

const block: IntakeBlock = {
  version: 5,
  suspensions: [
    { id: "X1", unitCode: null, reason: "Data request", createdAt: "2026-11-01T02:00:00Z" },
    { id: "X2", unitCode: "SV-1-P101", createdAt: "2026-11-02T02:00:00Z" },
  ],
  readiness: { units: [{ unitId: "U1", unitCode: "SV-1-P101" }, { unitId: "U2", unitCode: null }, { unitCode: "NO-ID" }] },
};

describe("suspensions", () => {
  it("suspension_listReasonAndRelease: lists each active suspension, the whole lead or its unit, with its reason", () => {
    expect(suspensionRows(block)).toEqual([
      { id: "X1", unitCode: null, reason: "Data request", createdAt: "2026-11-01T02:00:00Z" },
      { id: "X2", unitCode: "SV-1-P101", reason: null, createdAt: "2026-11-02T02:00:00Z" },
    ]);
    expect(suspensionRows({})).toEqual([]);
  });

  it("suspension_listReasonAndRelease: a suspension wants a reason, optionally for one unit of the result", () => {
    expect(suspensionProblem("")).toBe("required");
    expect(suspensionProblem("Data request")).toBeNull();
    expect(suspensionProblem("Call 0901234567")).toBe("phone");
    expect(suspensionBody({ unitId: "", reason: " Data request " }, block)).toEqual({ reason: "Data request", expectedVersion: 5 });
    expect(suspensionBody({ unitId: "U1", reason: "Data request" }, block)).toEqual({
      unitId: "U1",
      reason: "Data request",
      expectedVersion: 5,
    });
  });

  it("offers only units with an id and a code", () => {
    expect(suspendableUnits(block)).toEqual([{ unitId: "U1", unitCode: "SV-1-P101" }]);
  });

  it("suspension_listReasonAndRelease: a release wants a reason", () => {
    expect(releaseProblem(" ")).toBe("required");
    expect(releaseProblem("Request ended")).toBeNull();
    expect(releaseBody(" Request ended ", block)).toEqual({ releaseReason: "Request ended", expectedVersion: 5 });
  });
});
