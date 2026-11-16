import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementDetail } from "../types";

import { agreementAfter, agreementPath } from "./agreement-model";

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

const http = (status: number, code: string, correlationId?: string): ApiResult<BrokerageAgreementDetail> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: [],
  ...(correlationId === undefined ? {} : { correlationId }),
});

describe("agreementAfter (brokerage-agreement E05-S2, spec section 6)", () => {
  it("agreementModel_ok_headerAndVersionsInOrder: the header and one row per version, by number", () => {
    expect(agreementAfter({ ok: true, status: 200, replayed: false, data: DETAIL })).toEqual({
      kind: "ready",
      agreement: {
        statusKey: "status.DRAFTING",
        transactionTypeKey: "transactionType.LONG_TERM_RENT",
        unitCode: "P101",
        createdAt: "2026-11-20T03:15:00Z",
        leadPath: "/workspace/owner-leads/L1",
      },
      versions: [
        { versionNo: 1, statusKey: "versionStatus.DRAFT", startText: "1 Jan 2027", endText: "31 Dec 2027" },
        { versionNo: 2, statusKey: "versionStatus.AWAITING_OWNER", startText: "1 Feb 2027", endText: "31 Jan 2028" },
      ],
    });
  });

  it("agreementModel_notFoundOrForbidden_notFound: a 404 and a 403 read as not available", () => {
    expect(agreementAfter(http(404, "NOT_FOUND", "c-1"))).toEqual({ kind: "not-found" });
    expect(agreementAfter(http(403, "FORBIDDEN", "c-2"))).toEqual({ kind: "not-found" });
  });

  it("agreementModel_otherFailure_errorWithCorrelation: any other failure offers a retry, with its support code", () => {
    expect(agreementAfter(http(500, "INTERNAL_ERROR", "c-1"))).toEqual({ kind: "error", correlationId: "c-1" });
    expect(agreementAfter({ ok: false, kind: "network" })).toStrictEqual({ kind: "error" });
  });

  it("agreementModel_sessionStates_session: the session screens answer a signed-out or unavailable session", () => {
    expect(agreementAfter({ ok: false, kind: "signed-out" })).toEqual({ kind: "session" });
    expect(agreementAfter({ ok: false, kind: "unavailable" })).toEqual({ kind: "session" });
  });

  it("agreementPath_id_workspacePath: an agreement's page is under the workspace", () => {
    expect(agreementPath("A1")).toBe("/workspace/brokerage-agreements/A1");
  });
});
