import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementActivationRequest } from "../types";

import { activateVersion } from "./activation-flow";

const BODY: BrokerageAgreementActivationRequest = {
  expectedDataVersion: 7,
  versionNo: 2,
  statementVersion: "brokerage-activation-2026-11",
  documentNumber: "HDMG-2026/014",
  signedOn: "2026-11-16",
  sunvibeSignatoryName: "Nguyen Van A",
  sunvibeSignatoryTitle: "Director",
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

/** Activates version 2 of agreement A1 once, against an API that answers `answer`. */
async function activate(answer: ApiResult<undefined>) {
  const post = vi.fn(async () => answer);
  const outcome = await activateVersion("A1", BODY, { activate: post });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith("A1", BODY);
  // No value of the body is part of an outcome (brokerage-agreement BR-17).
  for (const value of [BODY.documentNumber, BODY.sunvibeSignatoryName, BODY.sunvibeSignatoryTitle]) {
    expect(JSON.stringify(outcome)).not.toContain(value);
  }
  return outcome;
}

describe("activateVersion (brokerage-agreement E05-S6, S6-D1, S6-D16, E05S6-P9)", () => {
  it("activationFlow_204_activated: a 204 is activated", async () => {
    expect(await activate({ ok: true, status: 204, replayed: false, data: undefined })).toEqual({ kind: "activated" });
  });

  it("activationFlow_refusals_byCode: each refusal is read by its status and code, never by message, the groups in the answer's order", async () => {
    expect(await activate(http(403, "AGREEMENT_ACTIVATOR_NOT_INDEPENDENT"))).toEqual({ kind: "refused", reason: "notIndependent" });
    expect(await activate(http(409, "AGREEMENT_NOT_AWAITING_ACTIVATION"))).toEqual({ kind: "refused", reason: "reload" });
    expect(await activate(http(409, "AGREEMENT_STATEMENT_OUTDATED"))).toEqual({ kind: "refused", reason: "reload" });
    expect(await activate(http(409, "AGREEMENT_VERSION_PERIOD_ENDED"))).toEqual({ kind: "refused", reason: "periodEnded" });
    expect(
      await activate(http(409, "AGREEMENT_NOT_ELIGIBLE", { fields: ["reasonGroups.OWNER", "reasonGroups.BASIS", "reasonGroups.NEW_GROUP"] })),
    ).toEqual({
      kind: "refused",
      reason: "notEligible",
      groupKeys: ["eligibility.reasons.OWNER", "eligibility.reasons.BASIS", "eligibility.reasons.OTHER"],
    });
    // A stale data version and a lost race without an entry alike.
    expect(await activate(http(409, "CONCURRENT_MODIFICATION", { fields: ["expectedDataVersion"] }))).toEqual({
      kind: "refused",
      reason: "concurrent",
    });
    expect(await activate(http(409, "CONCURRENT_MODIFICATION"))).toEqual({ kind: "refused", reason: "concurrent" });
    expect(await activate(http(404, "NOT_FOUND"))).toEqual({ kind: "refused", reason: "notFound" });
    expect(await activate(http(403, "FORBIDDEN"))).toEqual({ kind: "refused", reason: "notFound" });

    // Any other answer is failed, with its support code when it has one.
    expect(await activate(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }))).toEqual({ kind: "failed", correlationId: "c-9" });
    expect(await activate(http(409, "AGREEMENT_NOT_DRAFT"))).toStrictEqual({ kind: "failed" });
    expect(await activate(http(403, "AGREEMENT_NOT_ASSIGNEE"))).toStrictEqual({ kind: "failed" });
    expect(await activate({ ok: false, kind: "network" })).toStrictEqual({ kind: "failed" });
    expect(await activate({ ok: false, kind: "signed-out" })).toStrictEqual({ kind: "failed" });
  });

  it("activationFlow_badRequest_fieldEntries: a 400 on the document's fields reads per field (characters on a text, the date window on the date); any other 400 is failed with its support code", async () => {
    expect(await activate(http(400, "VALIDATION_FAILED", { fields: ["sunvibeSignatoryName"] }))).toEqual({
      kind: "refused",
      reason: "fields",
      fields: { sunvibeSignatoryName: "activation.errors.characters" },
    });
    expect(await activate(http(400, "VALIDATION_FAILED", { fields: ["signedOn"] }))).toEqual({
      kind: "refused",
      reason: "fields",
      fields: { signedOn: "activation.errors.signedOn" },
    });
    expect(
      await activate(http(400, "VALIDATION_FAILED", { fields: ["documentNumber", "sunvibeSignatoryTitle", "signedOn"] })),
    ).toEqual({
      kind: "refused",
      reason: "fields",
      fields: {
        documentNumber: "activation.errors.characters",
        sunvibeSignatoryTitle: "activation.errors.characters",
        signedOn: "activation.errors.signedOn",
      },
    });

    expect(await activate(http(400, "VALIDATION_FAILED", { fields: ["versionNo"], correlationId: "c-4" }))).toEqual({
      kind: "failed",
      correlationId: "c-4",
    });
    expect(await activate(http(400, "VALIDATION_FAILED", { fields: ["documentNumber", "statementVersion"], correlationId: "c-5" }))).toEqual({
      kind: "failed",
      correlationId: "c-5",
    });
    expect(await activate(http(400, "MALFORMED_REQUEST", { correlationId: "c-6" }))).toEqual({ kind: "failed", correlationId: "c-6" });
    expect(await activate(http(400, "VALIDATION_FAILED", { correlationId: "c-7" }))).toEqual({ kind: "failed", correlationId: "c-7" });
  });
});
