import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import { openDraft } from "./draft-open-flow";

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

/** Opens a new draft of agreement A1 at data version 3 once, against an API that answers `answer`. */
async function open(answer: ApiResult<undefined>) {
  const post = vi.fn(async () => answer);
  const outcome = await openDraft("A1", 3, { openDraft: post });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith("A1", { expectedDataVersion: 3 });
  return outcome;
}

describe("openDraft (brokerage-agreement E05-S5, S5-D10, S5-D14)", () => {
  it("draftOpenFlow_204_opened: a 204 is opened", async () => {
    expect(await open({ ok: true, status: 204, replayed: false, data: undefined })).toEqual({ kind: "opened" });
  });

  it("draftOpenFlow_refusals_byCode: each refusal is read by its status and code, never by message, the groups in the answer's order", async () => {
    expect(await open(http(409, "AGREEMENT_NEW_DRAFT_NOT_ALLOWED"))).toEqual({ kind: "refused", reason: "notAllowed" });
    expect(await open(http(409, "CONCURRENT_MODIFICATION", { fields: ["expectedDataVersion"] }))).toEqual({
      kind: "refused",
      reason: "stale",
    });
    expect(await open(http(409, "CONCURRENT_MODIFICATION"))).toEqual({ kind: "refused", reason: "stale" });
    expect(await open(http(409, "AGREEMENT_NOT_ELIGIBLE", { fields: ["reasonGroups.BASIS", "reasonGroups.NEW_GROUP"] }))).toEqual({
      kind: "refused",
      reason: "notEligible",
      groupKeys: ["eligibility.reasons.BASIS", "eligibility.reasons.OTHER"],
    });
    expect(await open(http(403, "AGREEMENT_NOT_ASSIGNEE"))).toEqual({ kind: "refused", reason: "notAssignee" });
    expect(await open(http(404, "NOT_FOUND"))).toEqual({ kind: "refused", reason: "notFound" });
    expect(await open(http(403, "FORBIDDEN"))).toEqual({ kind: "refused", reason: "notFound" });

    // Any other answer is failed, with its support code when it has one.
    expect(await open(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }))).toEqual({ kind: "failed", correlationId: "c-9" });
    expect(await open(http(400, "VALIDATION_FAILED", { fields: ["expectedDataVersion"] }))).toStrictEqual({ kind: "failed" });
    expect(await open(http(409, "AGREEMENT_NOT_DRAFT"))).toStrictEqual({ kind: "failed" });
    expect(await open({ ok: false, kind: "network" })).toStrictEqual({ kind: "failed" });
    expect(await open({ ok: false, kind: "signed-out" })).toStrictEqual({ kind: "failed" });
  });
});
