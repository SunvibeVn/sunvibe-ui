import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementCreated, BrokerageAgreementCreateRequest } from "../types";

import { submitDraft } from "./agreement-draft-flow";

const BODY: BrokerageAgreementCreateRequest = {
  leadId: "L1",
  unitId: "U1",
  transactionType: "LONG_TERM_RENT",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
};

const http = (
  status: number,
  code: string,
  extra: { fields?: string[]; correlationId?: string } = {},
): ApiResult<BrokerageAgreementCreated> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

/** Submits BODY once against an API that answers `answer`. */
async function submit(answer: ApiResult<BrokerageAgreementCreated>) {
  const createAgreement = vi.fn(async () => answer);
  const outcome = await submitDraft(BODY, { createAgreement });
  expect(createAgreement).toHaveBeenCalledTimes(1);
  expect(createAgreement).toHaveBeenCalledWith(BODY);
  return outcome;
}

describe("submitDraft (brokerage-agreement E05-S2, spec section 6)", () => {
  it("submitDraft_created_agreementId: a 201 hands back the new agreement's id", async () => {
    expect(await submit({ ok: true, status: 201, replayed: false, data: { agreementId: "A1" } })).toEqual({
      kind: "created",
      agreementId: "A1",
    });
    // A 201 without an id has no page to move to.
    expect(await submit({ ok: true, status: 201, replayed: false, data: {} })).toStrictEqual({ kind: "failed" });
  });

  it("submitDraft_validationFailed_invalidWithDateFields: a 400 names only the date fields, with the support code", async () => {
    expect(await submit(http(400, "VALIDATION_FAILED", { fields: ["endDate", "leadId"], correlationId: "c-1" }))).toEqual({
      kind: "invalid",
      fields: ["endDate"],
      correlationId: "c-1",
    });
  });

  it("submitDraft_notEligible_groupKeysInOrder: one text per group, in the answer's order, an unknown group as OTHER", async () => {
    const outcome = await submit(
      http(409, "AGREEMENT_NOT_ELIGIBLE", {
        fields: ["reasonGroups.BASIS", "reasonGroups.OWNER", "reasonGroups.NEW_GROUP"],
        correlationId: "c-2",
      }),
    );
    expect(outcome).toEqual({
      kind: "refused",
      reason: "notEligible",
      groupKeys: ["eligibility.reasons.BASIS", "eligibility.reasons.OWNER", "eligibility.reasons.OTHER"],
    });
  });

  it("submitDraft_eachRefusalCode_refusedReason: each refusal is read by its code and status", async () => {
    expect(await submit(http(409, "AGREEMENT_EXISTS"))).toEqual({ kind: "refused", reason: "exists" });
    expect(await submit(http(403, "AGREEMENT_NOT_ASSIGNEE"))).toEqual({ kind: "refused", reason: "notAssignee" });
    expect(await submit(http(404, "NOT_FOUND"))).toEqual({ kind: "refused", reason: "notFound" });
    expect(await submit(http(409, "CONCURRENT_MODIFICATION"))).toEqual({ kind: "refused", reason: "conflict" });
  });

  it("submitDraft_otherFailure_failedWithCorrelation: any other failure is failed, with its support code when it has one", async () => {
    expect(await submit(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }))).toEqual({
      kind: "failed",
      correlationId: "c-9",
    });
    expect(await submit(http(400, "MALFORMED_REQUEST", { correlationId: "c-8" }))).toEqual({
      kind: "failed",
      correlationId: "c-8",
    });
    expect(await submit(http(403, "FORBIDDEN", { correlationId: "c-7" }))).toEqual({ kind: "failed", correlationId: "c-7" });
    expect(await submit({ ok: false, kind: "network" })).toStrictEqual({ kind: "failed" });
    expect(await submit({ ok: false, kind: "signed-out" })).toStrictEqual({ kind: "failed" });
    expect(await submit({ ok: false, kind: "unavailable" })).toStrictEqual({ kind: "failed" });
  });
});
