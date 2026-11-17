import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementConfirmationRequest } from "../types";

import { confirmVersions } from "./owner-confirm-flow";

const http = (
  status: number,
  code: string | undefined,
  extra: { fields?: string[]; correlationId?: string } = {},
): ApiResult<undefined> => ({
  ok: false,
  kind: "http",
  status,
  ...(code === undefined ? {} : { code }),
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

const BODY: BrokerageAgreementConfirmationRequest = {
  currentPassword: "secret-1",
  statementVersion: "brokerage-agreement-2026-11",
  versions: [
    { agreementId: "A1", versionNo: 1 },
    { agreementId: "A2", versionNo: 2 },
  ],
};

/** Confirms the two versions of BODY once, against an API that answers `answer`. */
async function confirm(answer: ApiResult<undefined>) {
  const post = vi.fn(async () => answer);
  const outcome = await confirmVersions(BODY, { confirmVersions: post });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith(BODY);
  return outcome;
}

describe("confirmVersions (brokerage-agreement E05-S5, S5-D4 to S5-D6, spec section 6)", () => {
  it("ownerConfirmFlow_204_confirmed: a 204 is confirmed", async () => {
    expect(await confirm({ ok: true, status: 204, replayed: false, data: undefined })).toEqual({ kind: "confirmed" });
  });

  it("ownerConfirmFlow_refusals_byCode: each refusal is read by its status, code and field, never by message", async () => {
    expect(await confirm(http(400, "VALIDATION_FAILED", { fields: ["currentPassword"] }))).toEqual({
      kind: "refused",
      reason: "wrongPassword",
    });
    expect(await confirm(http(423, "ACCOUNT_LOCKED"))).toEqual({ kind: "refused", reason: "locked" });
    expect(await confirm(http(429, "RATE_LIMITED"))).toEqual({ kind: "refused", reason: "tooMany" });
    expect(await confirm(http(429, undefined))).toEqual({ kind: "refused", reason: "tooMany" });
    expect(await confirm(http(404, "NOT_FOUND"))).toEqual({ kind: "refused", reason: "reload" });
    expect(await confirm(http(409, "AGREEMENT_NOT_AWAITING_OWNER", { fields: ["versions[1]"] }))).toEqual({
      kind: "refused",
      reason: "reload",
    });
    expect(await confirm(http(409, "AGREEMENT_STATEMENT_OUTDATED"))).toEqual({ kind: "refused", reason: "reload" });
    expect(await confirm(http(409, "CONCURRENT_MODIFICATION"))).toEqual({ kind: "refused", reason: "concurrent" });
  });

  it("ownerConfirmFlow_notEligible_perItemGroups: each failing item, by its index, names its version and the owner's group texts in the answer's order", async () => {
    expect(
      await confirm(
        http(409, "AGREEMENT_NOT_ELIGIBLE", {
          fields: [
            "versions[1].reasonGroups.PROPERTY",
            "versions[0].reasonGroups.BASIS",
            "versions[1].reasonGroups.OWNER",
            "versions[0].reasonGroups.NEW_GROUP",
            "versions[7].reasonGroups.UNIT",
            "somethingElse",
          ],
        }),
      ),
    ).toEqual({
      kind: "refused",
      reason: "notEligible",
      items: [
        { agreementId: "A1", versionNo: 1, groupKeys: ["owner.reasons.BASIS", "owner.reasons.OTHER"] },
        { agreementId: "A2", versionNo: 2, groupKeys: ["owner.reasons.PROPERTY", "owner.reasons.OWNER"] },
      ],
    });
  });

  it("ownerConfirmFlow_otherError_failedWithCorrelationId: any other answer is failed, with its support code when it has one", async () => {
    expect(await confirm(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }))).toEqual({ kind: "failed", correlationId: "c-9" });
    expect(
      await confirm(http(400, "VALIDATION_FAILED", { fields: ["currentPassword", "versions"], correlationId: "c-8" })),
    ).toEqual({ kind: "failed", correlationId: "c-8" });
    expect(await confirm(http(400, "VALIDATION_FAILED", { fields: ["statementVersion"] }))).toStrictEqual({ kind: "failed" });
    expect(await confirm(http(400, "MALFORMED_REQUEST"))).toStrictEqual({ kind: "failed" });
    expect(await confirm(http(403, "FORBIDDEN"))).toStrictEqual({ kind: "failed" });
    expect(await confirm(http(423, "SOMETHING_ELSE"))).toStrictEqual({ kind: "failed" });
    expect(await confirm(http(409, "AGREEMENT_EXISTS"))).toStrictEqual({ kind: "failed" });
    expect(await confirm({ ok: false, kind: "network" })).toStrictEqual({ kind: "failed" });
    expect(await confirm({ ok: false, kind: "signed-out" })).toStrictEqual({ kind: "failed" });
    expect(await confirm({ ok: false, kind: "unavailable" })).toStrictEqual({ kind: "failed" });
  });
});
