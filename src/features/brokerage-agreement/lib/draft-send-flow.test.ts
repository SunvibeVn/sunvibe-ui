import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import { sendDraft } from "./draft-send-flow";

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

/** Sends the draft of agreement A1 at data version 3 once, against an API that answers `answer`. */
async function send(answer: ApiResult<undefined>) {
  const submitDraft = vi.fn(async () => answer);
  const outcome = await sendDraft("A1", 3, { submitDraft });
  expect(submitDraft).toHaveBeenCalledTimes(1);
  expect(submitDraft).toHaveBeenCalledWith("A1", { expectedDataVersion: 3 });
  return outcome;
}

describe("sendDraft (brokerage-agreement E05-S4, S4-D2, S4-D6, S4-D11)", () => {
  it("draftSendFlow_204_sent: a 204 is sent", async () => {
    expect(await send({ ok: true, status: 204, replayed: false, data: undefined })).toEqual({ kind: "sent" });
  });

  it("draftSendFlow_refusals_byCode: each refusal is read by its status and code, never by message, with the parts and groups in the answer's order", async () => {
    expect(
      await send(
        http(409, "AGREEMENT_VERSION_INCOMPLETE", {
          fields: ["photoConsent", "terms.deposit", "feePolicy.formula", "feePolicy.protectionDays", "feePolicy.newPart"],
        }),
      ),
    ).toEqual({
      kind: "refused",
      reason: "incomplete",
      partKeys: ["send.part.photoConsent", "send.part.deposit", "send.part.formula", "send.part.protectionDays", "send.part.OTHER"],
    });
    expect(
      await send(http(409, "AGREEMENT_NOT_ELIGIBLE", { fields: ["reasonGroups.BASIS", "reasonGroups.OWNER", "reasonGroups.NEW_GROUP"] })),
    ).toEqual({
      kind: "refused",
      reason: "notEligible",
      groupKeys: ["eligibility.reasons.BASIS", "eligibility.reasons.OWNER", "eligibility.reasons.OTHER"],
    });
    expect(await send(http(409, "AGREEMENT_NOT_DRAFT"))).toEqual({ kind: "refused", reason: "notDraft" });
    expect(await send(http(409, "CONCURRENT_MODIFICATION", { fields: ["expectedDataVersion"] }))).toEqual({
      kind: "refused",
      reason: "stale",
    });
    expect(await send(http(409, "CONCURRENT_MODIFICATION"))).toEqual({ kind: "refused", reason: "stale" });
    expect(await send(http(409, "AGREEMENT_SENDING_NOT_AVAILABLE"))).toEqual({ kind: "refused", reason: "sendingOff" });
    expect(await send(http(403, "AGREEMENT_NOT_ASSIGNEE"))).toEqual({ kind: "refused", reason: "notAssignee" });
    expect(await send(http(404, "NOT_FOUND"))).toEqual({ kind: "refused", reason: "notFound" });
    expect(await send(http(403, "FORBIDDEN"))).toEqual({ kind: "refused", reason: "notFound" });
  });

  it("draftSendFlow_otherError_failedWithCorrelationId: any other answer is failed, with its support code when it has one", async () => {
    expect(await send(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }))).toEqual({ kind: "failed", correlationId: "c-9" });
    expect(await send(http(400, "VALIDATION_FAILED", { fields: ["expectedDataVersion"], correlationId: "c-8" }))).toEqual({
      kind: "failed",
      correlationId: "c-8",
    });
    expect(await send(http(400, "MALFORMED_REQUEST"))).toStrictEqual({ kind: "failed" });
    expect(await send(http(409, "AGREEMENT_EXISTS"))).toStrictEqual({ kind: "failed" });
    expect(await send({ ok: false, kind: "network" })).toStrictEqual({ kind: "failed" });
    expect(await send({ ok: false, kind: "signed-out" })).toStrictEqual({ kind: "failed" });
    expect(await send({ ok: false, kind: "unavailable" })).toStrictEqual({ kind: "failed" });
  });
});
