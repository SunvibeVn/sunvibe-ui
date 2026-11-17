import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import { rejectVersion } from "./owner-reject-flow";

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

const NO_CONTENT: ApiResult<undefined> = { ok: true, status: 204, replayed: false, data: undefined };

/** Declines version 1 of agreement A1 once with `reason`, against an API that answers `answer`; returns the outcome and the body sent. */
async function decline(answer: ApiResult<undefined>, reason = "The rent is too low.") {
  const post = vi.fn(async () => answer);
  const outcome = await rejectVersion("A1", 1, reason, { rejectVersion: post });
  expect(post).toHaveBeenCalledTimes(1);
  return { outcome, call: post.mock.calls[0] as unknown[] };
}

describe("rejectVersion (brokerage-agreement E05-S5, S5-D7, spec section 6)", () => {
  it("ownerRejectFlow_204_declined: a 204 is declined, the reason sent as the owner typed it", async () => {
    const { outcome, call } = await decline(NO_CONTENT, "  The rent is too low.  ");

    expect(outcome).toEqual({ kind: "declined" });
    expect(call).toEqual(["A1", { versionNo: 1, reason: "  The rent is too low.  " }]);
  });

  it("ownerRejectFlow_blankReason_sentAsNull: an empty or blank reason is sent as null, no reason given", async () => {
    for (const reason of ["", "   ", "\n\t "]) {
      const { call } = await decline(NO_CONTENT, reason);
      expect(call).toEqual(["A1", { versionNo: 1, reason: null }]);
    }
  });

  it("ownerRejectFlow_refusals_byCode: each refusal is read by its status, code and field, never by message", async () => {
    expect((await decline(http(404, "NOT_FOUND"))).outcome).toEqual({ kind: "refused", reason: "reload" });
    expect((await decline(http(409, "AGREEMENT_NOT_AWAITING_OWNER"))).outcome).toEqual({ kind: "refused", reason: "reload" });
    expect((await decline(http(400, "VALIDATION_FAILED", { fields: ["reason"] }))).outcome).toEqual({
      kind: "refused",
      reason: "badReason",
    });
    expect((await decline(http(429, "RATE_LIMITED"))).outcome).toEqual({ kind: "refused", reason: "tooMany" });
    expect((await decline(http(409, "CONCURRENT_MODIFICATION"))).outcome).toEqual({ kind: "refused", reason: "concurrent" });
    // Any other answer is failed, with its support code when it has one.
    expect((await decline(http(400, "VALIDATION_FAILED", { fields: ["versionNo"], correlationId: "c-7" }))).outcome).toEqual({
      kind: "failed",
      correlationId: "c-7",
    });
    expect((await decline(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }))).outcome).toEqual({
      kind: "failed",
      correlationId: "c-9",
    });
    expect((await decline(http(403, "FORBIDDEN"))).outcome).toStrictEqual({ kind: "failed" });
    expect((await decline({ ok: false, kind: "network" })).outcome).toStrictEqual({ kind: "failed" });
    expect((await decline({ ok: false, kind: "signed-out" })).outcome).toStrictEqual({ kind: "failed" });
  });
});
