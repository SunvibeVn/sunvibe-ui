import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementDraftRequest } from "../types";

import { saveDraft } from "./draft-edit-flow";

const BODY: BrokerageAgreementDraftRequest = {
  expectedDataVersion: 3,
  transactionType: "LONG_TERM_RENT",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  photoConsent: null,
  exteriorPhotoConsent: false,
  terms: { monthlyRent: null, deposit: null, minimumTermMonths: null, paymentPeriodMonths: null, mandatoryFees: null },
};

const http = (
  status: number,
  code: string,
  extra: { fields?: string[]; correlationId?: string } = {},
): ApiResult<undefined> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

/** Saves BODY once for agreement A1 against an API that answers `answer`. */
async function save(answer: ApiResult<undefined>) {
  const updateDraft = vi.fn(async () => answer);
  const outcome = await saveDraft("A1", BODY, { updateDraft });
  expect(updateDraft).toHaveBeenCalledTimes(1);
  expect(updateDraft).toHaveBeenCalledWith("A1", BODY);
  return outcome;
}

describe("saveDraft (brokerage-agreement E05-S3, spec section 4, S3-D3)", () => {
  it("saveDraft_noContent_saved: a 204 is saved", async () => {
    expect(await save({ ok: true, status: 204, replayed: false, data: undefined })).toEqual({ kind: "saved" });
  });

  it("saveDraft_validationFailed_invalidWithFields: a 400 marks the form fields its entries name, with the support code", async () => {
    expect(
      await save(
        http(400, "VALIDATION_FAILED", {
          fields: ["terms.mandatoryFees[2].amount", "terms.deposit.currency", "endDate", "expectedDataVersion", "terms.deposit.amount"],
          correlationId: "c-1",
        }),
      ),
    ).toEqual({ kind: "invalid", fields: ["fees.2.amount", "depositAmount", "endDate"], correlationId: "c-1" });
    expect(await save(http(400, "VALIDATION_FAILED"))).toStrictEqual({ kind: "invalid", fields: [] });
  });

  it("saveDraft_notEligible_groupKeysInOrder: one text per group, in the answer's order, an unknown group as OTHER", async () => {
    expect(
      await save(
        http(409, "AGREEMENT_NOT_ELIGIBLE", {
          fields: ["reasonGroups.BASIS", "reasonGroups.UNIT", "reasonGroups.NEW_GROUP"],
          correlationId: "c-2",
        }),
      ),
    ).toEqual({
      kind: "refused",
      reason: "notEligible",
      groupKeys: ["eligibility.reasons.BASIS", "eligibility.reasons.UNIT", "eligibility.reasons.OTHER"],
    });
  });

  it("saveDraft_eachRefusalCode_refusedReason: each refusal is read by its status and code, never by message", async () => {
    expect(await save(http(409, "AGREEMENT_NOT_DRAFT"))).toEqual({ kind: "refused", reason: "notDraft" });
    expect(await save(http(409, "CONCURRENT_MODIFICATION", { fields: ["expectedDataVersion"] }))).toEqual({
      kind: "refused",
      reason: "stale",
    });
    expect(await save(http(409, "CONCURRENT_MODIFICATION"))).toEqual({ kind: "refused", reason: "stale" });
    expect(await save(http(403, "AGREEMENT_NOT_ASSIGNEE"))).toEqual({ kind: "refused", reason: "notAssignee" });
    expect(await save(http(404, "NOT_FOUND"))).toEqual({ kind: "refused", reason: "notFound" });
    expect(await save(http(403, "FORBIDDEN"))).toEqual({ kind: "refused", reason: "notFound" });
  });

  it("saveDraft_otherFailure_failedWithCorrelation: any other failure is failed, with its support code when it has one", async () => {
    expect(await save(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }))).toEqual({ kind: "failed", correlationId: "c-9" });
    expect(await save(http(400, "MALFORMED_REQUEST", { correlationId: "c-8" }))).toEqual({
      kind: "failed",
      correlationId: "c-8",
    });
    expect(await save(http(409, "AGREEMENT_EXISTS"))).toStrictEqual({ kind: "failed" });
    expect(await save({ ok: false, kind: "network" })).toStrictEqual({ kind: "failed" });
    expect(await save({ ok: false, kind: "signed-out" })).toStrictEqual({ kind: "failed" });
    expect(await save({ ok: false, kind: "unavailable" })).toStrictEqual({ kind: "failed" });
  });
});
