import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { BrokerageEligibility } from "../types";

import { eligibilityAfter } from "./eligibility-model";

const answered = (data: BrokerageEligibility): ApiResult<BrokerageEligibility> => ({
  ok: true,
  data,
  status: 200,
  replayed: false,
});

const http = (status: number, code: string, correlationId?: string): ApiResult<BrokerageEligibility> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: [],
  ...(correlationId === undefined ? {} : { correlationId }),
});

describe("eligibilityAfter (brokerage-agreement E05-S1, spec section 6)", () => {
  it("eligibilityModel_noBasis_hidden: a lead with no completed intake shows nothing", () => {
    expect(eligibilityAfter(answered({ basisState: "NONE", viewerIsAssignedSale: true, units: [] }))).toEqual({
      kind: "hidden",
    });
    expect(eligibilityAfter(answered({ viewerIsAssignedSale: true, units: [] }))).toEqual({ kind: "hidden" });
  });

  it("eligibilityModel_notFoundForbiddenOrSession_hidden: a 404, a 403 and the session states hide the section", () => {
    const results: ApiResult<BrokerageEligibility>[] = [
      http(404, "NOT_FOUND", "c-1"),
      http(403, "FORBIDDEN", "c-2"),
      { ok: false, kind: "signed-out" },
      { ok: false, kind: "unavailable" },
    ];
    for (const result of results) expect(eligibilityAfter(result)).toEqual({ kind: "hidden" });
  });

  it("eligibilityModel_otherFailure_errorWithCorrelation: any other failure offers a retry, with its support code", () => {
    expect(eligibilityAfter(http(500, "INTERNAL_ERROR", "c-1"))).toEqual({ kind: "error", correlationId: "c-1" });
    expect(eligibilityAfter(http(405, "MALFORMED_REQUEST"))).toEqual({ kind: "error" });
    expect(eligibilityAfter({ ok: false, kind: "network" })).toEqual({ kind: "error" });
  });

  it("eligibilityModel_usableBasis_rowPerUnitInOrder: one row per unit, in the answer's order, with its groups' texts", () => {
    const model = eligibilityAfter(
      answered({
        basisState: "USABLE",
        viewerIsAssignedSale: true,
        units: [
          { unitId: "U1", unitCode: "P101", eligible: true, reasonGroups: [] },
          { unitId: "U2", unitCode: "P102", eligible: false, reasonGroups: ["PROPERTY", "OWNER"] },
        ],
      }),
    );

    expect(model).toEqual({
      kind: "ready",
      assignedOnly: false,
      rows: [
        { unitId: "U1", unitCode: "P101", eligible: true, reasonKeys: [] },
        {
          unitId: "U2",
          unitCode: "P102",
          eligible: false,
          reasonKeys: ["eligibility.reasons.PROPERTY", "eligibility.reasons.OWNER"],
        },
      ],
    });
  });

  it("eligibilityModel_unitWithoutCode_noCodeText: a unit whose code is null or absent keeps no code", () => {
    const model = eligibilityAfter(
      answered({
        basisState: "SUSPENDED",
        viewerIsAssignedSale: true,
        units: [
          { unitId: "U1", unitCode: null, eligible: false, reasonGroups: ["BASIS"] },
          { unitId: "U2", eligible: false, reasonGroups: ["BASIS"] },
        ],
      }),
    );

    expect(model.kind === "ready" ? model.rows.map((row) => row.unitCode) : model).toEqual([null, null]);
  });

  it("eligibilityModel_viewerNotAssignedSale_assignedOnlyNote: only a viewer who is not the assigned Sale reads the note", () => {
    const unit = { unitId: "U1", unitCode: "P101", eligible: true, reasonGroups: [] };
    const notAssigned = eligibilityAfter(answered({ basisState: "USABLE", viewerIsAssignedSale: false, units: [unit] }));
    const assigned = eligibilityAfter(answered({ basisState: "USABLE", viewerIsAssignedSale: true, units: [unit] }));

    expect(notAssigned).toMatchObject({ kind: "ready", assignedOnly: true });
    expect(assigned).toMatchObject({ kind: "ready", assignedOnly: false });
  });
});
