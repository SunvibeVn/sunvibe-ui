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

/** The content of a version whose answer leaves the E05-S3 fields out (brokerage-agreement S3-D14). */
const NOTHING_ENTERED = {
  advertising: null,
  interior: { key: "terms.notAnswered" },
  exterior: { key: "terms.no" },
  monthlyRent: { key: "terms.notEntered" },
  deposit: { key: "terms.notEntered" },
  minimumTerm: { key: "terms.notEntered" },
  paymentPeriod: { key: "terms.notEntered" },
  fees: { kind: "notStated" },
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
        {
          versionNo: 1,
          statusKey: "versionStatus.DRAFT",
          startText: "1 Jan 2027",
          endText: "31 Dec 2027",
          content: { ...NOTHING_ENTERED, proposed: true },
        },
        {
          versionNo: 2,
          statusKey: "versionStatus.AWAITING_OWNER",
          startText: "1 Feb 2027",
          endText: "31 Jan 2028",
          content: { ...NOTHING_ENTERED, proposed: false },
        },
      ],
      dataVersion: null,
      canEditDraft: false,
      draft: null,
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

describe("agreementAfter, the draft the page may edit (brokerage-agreement E05-S3, S3-D14, E05S3-P7)", () => {
  const DRAFT_VERSION = DETAIL.versions?.[1] as NonNullable<BrokerageAgreementDetail["versions"]>[number];
  const ready = (data: BrokerageAgreementDetail) => agreementAfter({ ok: true, status: 200, replayed: false, data });

  it("agreementModel_assignedSaleDraft_canEditDraft: the assigned Sale may edit the DRAFT version of a drafting agreement", () => {
    const model = ready({ ...DETAIL, versions: [DRAFT_VERSION], dataVersion: 0, viewerIsAssignedSale: true });

    expect(model).toMatchObject({ kind: "ready", dataVersion: 0, canEditDraft: true, draft: DRAFT_VERSION });
  });

  it("agreementModel_managerOrNotDraft_cannotEdit: a viewer who is not the assigned Sale, a version past its draft, a cancelled agreement and an answer without dataVersion offer no edit", () => {
    const awaiting = { ...DRAFT_VERSION, status: "AWAITING_OWNER" as const };
    const cancelled = { ...DRAFT_VERSION, status: "CANCELLED" as const };
    const answers: BrokerageAgreementDetail[] = [
      { ...DETAIL, versions: [DRAFT_VERSION], dataVersion: 0, viewerIsAssignedSale: false },
      { ...DETAIL, versions: [awaiting], dataVersion: 3, viewerIsAssignedSale: true },
      { ...DETAIL, status: "CANCELLED", versions: [cancelled], dataVersion: 4, viewerIsAssignedSale: true },
      { ...DETAIL, status: "CANCELLED", versions: [DRAFT_VERSION], dataVersion: 4, viewerIsAssignedSale: true },
      { ...DETAIL, versions: [DRAFT_VERSION], viewerIsAssignedSale: true },
    ];
    for (const answer of answers) expect(ready(answer)).toMatchObject({ kind: "ready", canEditDraft: false, draft: null });
    expect(ready(answers[1] as BrokerageAgreementDetail)).toMatchObject({ dataVersion: 3 });
    expect(ready(answers[4] as BrokerageAgreementDetail)).toMatchObject({ dataVersion: null });
  });
});
