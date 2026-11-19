import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import { suspend } from "./suspension-flow";

const http = (status: number, code: string, extra: { fields?: string[]; correlationId?: string } = {}): ApiResult<undefined> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

const OK: ApiResult<undefined> = { ok: true, status: 204, replayed: false, data: undefined };

const NOTE = "Tenant reported a different price.";

/** Suspends agreement A1 once with a complaint, against an API that answers `answer`. */
async function run(answer: ApiResult<undefined>, noteText = NOTE) {
  const post = vi.fn(async () => answer);
  const outcome = await suspend("A1", { reasonType: "COMPLAINT", noteText }, { suspendAgreement: post });
  expect(post).toHaveBeenCalledTimes(1);
  // The note is never part of an outcome (brokerage-agreement BR-17).
  expect(JSON.stringify(outcome)).not.toContain("different price");
  return { outcome, post };
}

describe("suspend (brokerage-agreement E05-S8, S8-D6, S8-D12, E05S8-P13)", () => {
  it("suspensionFlow_outcomes_byStatusAndCode: the reason and the note as typed, a blank note as null, no data version; each answer read by status, code and field, never by message", async () => {
    const { outcome, post } = await run(OK, "  Checked.  ");
    expect(outcome).toEqual({ kind: "done" });
    expect(post).toHaveBeenCalledWith("A1", { reasonType: "COMPLAINT", note: "  Checked.  " });
    for (const blank of ["", "   "]) {
      expect((await run(OK, blank)).post).toHaveBeenCalledWith("A1", { reasonType: "COMPLAINT", note: null });
    }

    expect((await run(http(400, "VALIDATION_FAILED", { fields: ["note"] }))).outcome).toEqual({ kind: "fields", fields: ["note"] });
    expect((await run(http(409, "CONCURRENT_MODIFICATION"))).outcome).toEqual({ kind: "concurrent" });
    for (const [status, code] of [
      [403, "FORBIDDEN"],
      [409, "AGREEMENT_ENDED"],
      [409, "AGREEMENT_NOT_IN_EFFECT"],
      [409, "AGREEMENT_ALREADY_SUSPENDED"],
      [409, "SOMETHING_NEW"],
    ] as const) {
      expect((await run(http(status, code))).outcome).toEqual({ kind: "changed", code });
    }
    // A 403 or 409 without a code still means the state changed.
    expect((await run({ ok: false, kind: "http", status: 409, fieldErrors: [] })).outcome).toEqual({ kind: "changed", code: "" });
    expect((await run(http(404, "NOT_FOUND"))).outcome).toEqual({ kind: "notFound" });

    expect((await run(http(400, "MALFORMED_REQUEST", { correlationId: "c-4" }))).outcome).toEqual({ kind: "failed", correlationId: "c-4" });
    expect((await run(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }))).outcome).toEqual({ kind: "failed", correlationId: "c-9" });
    expect((await run(http(500, "INTERNAL_ERROR"))).outcome).toStrictEqual({ kind: "failed" });
    expect((await run({ ok: false, kind: "network" })).outcome).toStrictEqual({ kind: "failed" });
  });
});
