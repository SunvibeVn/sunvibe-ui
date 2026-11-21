import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import { cancel } from "./cancellation-flow";

const http = (status: number, code: string, extra: { fields?: string[]; correlationId?: string } = {}): ApiResult<undefined> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

const OK: ApiResult<undefined> = { ok: true, status: 204, replayed: false, data: undefined };

/** Cancels agreement A1 read at data version 3 once, against an API that answers `answer`. */
async function run(answer: ApiResult<undefined>) {
  const post = vi.fn(async () => answer);
  const outcome = await cancel("A1", { dataVersion: 3 }, { cancelAgreement: post });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith("A1", { expectedDataVersion: 3 });
  return outcome;
}

describe("cancel (brokerage-agreement E05-S8, S8-D7, S8-D12, E05S8-P13)", () => {
  it("cancellationFlow_outcomes_byStatusAndCode: the page's data version only; each answer read by status and code", async () => {
    expect(await run(OK)).toEqual({ kind: "done" });
    expect(await run(http(409, "AGREEMENT_TOOK_EFFECT"))).toEqual({ kind: "changed", code: "AGREEMENT_TOOK_EFFECT" });
    expect(await run(http(409, "CONCURRENT_MODIFICATION", { fields: ["expectedDataVersion"] }))).toEqual({ kind: "concurrent" });
    for (const [status, code] of [
      [403, "FORBIDDEN"],
      [403, "AGREEMENT_ASSIGNEE_ONLY"],
      [409, "AGREEMENT_ENDED"],
    ] as const) {
      expect(await run(http(status, code))).toEqual({ kind: "changed", code });
    }
    expect(await run(http(400, "VALIDATION_FAILED", { fields: ["expectedDataVersion"] }))).toEqual({
      kind: "fields",
      fields: ["expectedDataVersion"],
    });
    expect(await run(http(404, "NOT_FOUND"))).toEqual({ kind: "notFound" });
    expect(await run(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }))).toEqual({ kind: "failed", correlationId: "c-9" });
    expect(await run({ ok: false, kind: "network" })).toStrictEqual({ kind: "failed" });
  });
});
