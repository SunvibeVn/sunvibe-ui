import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import { releaseSuspension } from "./suspension-release-flow";

const http = (status: number, code: string, extra: { fields?: string[]; correlationId?: string } = {}): ApiResult<undefined> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

const OK: ApiResult<undefined> = { ok: true, status: 204, replayed: false, data: undefined };

const REASON = "The price was checked with the owner.";

/** Lifts the suspension of agreement A1 read at data version 7 once, against an API that answers `answer`. */
async function run(answer: ApiResult<undefined>) {
  const post = vi.fn(async () => answer);
  const outcome = await releaseSuspension("A1", { reason: REASON, dataVersion: 7 }, { releaseAgreementSuspension: post });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith("A1", { expectedDataVersion: 7, reason: REASON });
  expect(JSON.stringify(outcome)).not.toContain("checked with");
  return outcome;
}

describe("releaseSuspension (brokerage-agreement E05-S8, S8-D6, S8-D12, E05S8-P13)", () => {
  it("suspensionReleaseFlow_outcomes_byStatusAndCode: the reason as typed with the page's data version; each answer read by status, code and field", async () => {
    expect(await run(OK)).toEqual({ kind: "done" });
    expect(await run(http(400, "VALIDATION_FAILED", { fields: ["reason"] }))).toEqual({ kind: "fields", fields: ["reason"] });
    // A stale data version, and a basis lead moved, both answer CONCURRENT_MODIFICATION.
    expect(await run(http(409, "CONCURRENT_MODIFICATION", { fields: ["expectedDataVersion"] }))).toEqual({ kind: "concurrent" });
    expect(await run(http(409, "CONCURRENT_MODIFICATION"))).toEqual({ kind: "concurrent" });
    for (const [status, code] of [
      [403, "FORBIDDEN"],
      [403, "AGREEMENT_RELEASER_NOT_INDEPENDENT"],
      [409, "AGREEMENT_ENDED"],
      [409, "AGREEMENT_NOT_SUSPENDED"],
    ] as const) {
      expect(await run(http(status, code))).toEqual({ kind: "changed", code });
    }
    expect(await run(http(404, "NOT_FOUND"))).toEqual({ kind: "notFound" });
    expect(await run(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }))).toEqual({ kind: "failed", correlationId: "c-9" });
    expect(await run({ ok: false, kind: "network" })).toStrictEqual({ kind: "failed" });
  });
});
