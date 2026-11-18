import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import { refuseActivation } from "./activation-refusal-flow";

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

const NOTE = "The rent on the signed page differs.";

/** Refuses the activation of version 2 of agreement A1 at data version 7 once, against an API that answers `answer`. */
async function refuse(answer: ApiResult<undefined>, noteText = NOTE) {
  const post = vi.fn(async () => answer);
  const outcome = await refuseActivation(
    "A1",
    { versionNo: 2, reasonType: "DOCUMENT_DIFFERS", noteText, dataVersion: 7 },
    { refuseActivation: post },
  );
  expect(post).toHaveBeenCalledTimes(1);
  // The note is never part of an outcome (brokerage-agreement BR-17).
  expect(JSON.stringify(outcome)).not.toContain("signed page");
  return { outcome, post };
}

const OK: ApiResult<undefined> = { ok: true, status: 204, replayed: false, data: undefined };

describe("refuseActivation (brokerage-agreement E05-S6, S6-D4, E05S6-P9)", () => {
  it("activationRefusalFlow_blankNote_sentAsNull: a blank note is sent as null, any other as typed, with the type, the version and the data version", async () => {
    for (const blank of ["", "   "]) {
      const { post } = await refuse(OK, blank);
      expect(post).toHaveBeenCalledWith("A1", { expectedDataVersion: 7, versionNo: 2, reasonType: "DOCUMENT_DIFFERS", note: null });
    }
    const { outcome, post } = await refuse(OK, "  Rent differs.  ");
    expect(outcome).toEqual({ kind: "recorded" });
    expect(post).toHaveBeenCalledWith("A1", {
      expectedDataVersion: 7,
      versionNo: 2,
      reasonType: "DOCUMENT_DIFFERS",
      note: "  Rent differs.  ",
    });
  });

  it("activationRefusalFlow_refusals_byCode: each refusal is read by its status, code and field, never by message", async () => {
    expect((await refuse(http(403, "AGREEMENT_ACTIVATOR_NOT_INDEPENDENT"))).outcome).toEqual({ kind: "refused", reason: "notIndependent" });
    expect((await refuse(http(409, "AGREEMENT_NOT_AWAITING_ACTIVATION"))).outcome).toEqual({ kind: "refused", reason: "reload" });
    expect((await refuse(http(409, "CONCURRENT_MODIFICATION", { fields: ["expectedDataVersion"] }))).outcome).toEqual({
      kind: "refused",
      reason: "concurrent",
    });
    expect((await refuse(http(409, "CONCURRENT_MODIFICATION"))).outcome).toEqual({ kind: "refused", reason: "concurrent" });
    expect((await refuse(http(400, "VALIDATION_FAILED", { fields: ["note"] }))).outcome).toEqual({ kind: "refused", reason: "badNote" });
    expect((await refuse(http(404, "NOT_FOUND"))).outcome).toEqual({ kind: "refused", reason: "notFound" });
    expect((await refuse(http(403, "FORBIDDEN"))).outcome).toEqual({ kind: "refused", reason: "notFound" });

    // Any other answer is failed, with its support code when it has one.
    expect((await refuse(http(400, "VALIDATION_FAILED", { fields: ["reasonType"], correlationId: "c-3" }))).outcome).toEqual({
      kind: "failed",
      correlationId: "c-3",
    });
    expect((await refuse(http(400, "VALIDATION_FAILED", { fields: ["note", "versionNo"] }))).outcome).toStrictEqual({ kind: "failed" });
    expect((await refuse(http(400, "MALFORMED_REQUEST", { correlationId: "c-4" }))).outcome).toEqual({ kind: "failed", correlationId: "c-4" });
    expect((await refuse(http(409, "AGREEMENT_STATEMENT_OUTDATED"))).outcome).toStrictEqual({ kind: "failed" });
    expect((await refuse(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }))).outcome).toEqual({ kind: "failed", correlationId: "c-9" });
    expect((await refuse({ ok: false, kind: "network" })).outcome).toStrictEqual({ kind: "failed" });
  });
});
