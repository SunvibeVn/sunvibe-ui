import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { BrokerageAgreementTerminationRequest } from "../types";

import { terminate } from "./termination-flow";

const http = (status: number, code: string, extra: { fields?: string[]; correlationId?: string } = {}): ApiResult<undefined> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

const OK: ApiResult<undefined> = { ok: true, status: 204, replayed: false, data: undefined };

const BODY: BrokerageAgreementTerminationRequest = {
  type: "UNIT_LET",
  reportedOn: "2026-12-02",
  introducedBySunvibe: "UNKNOWN",
  note: "Lease signed with a tenant.",
};

/** Terminates agreement A1 once with `BODY`, against an API that answers `answer`. */
async function run(answer: ApiResult<undefined>) {
  const post = vi.fn(async () => answer);
  const outcome = await terminate("A1", BODY, { terminateAgreement: post });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith("A1", BODY);
  expect(JSON.stringify(outcome)).not.toContain("Lease signed");
  return outcome;
}

describe("terminate (brokerage-agreement E05-S8, S8-D5, S8-D12, E05S8-P13)", () => {
  it("terminationFlow_outcomes_byStatusAndCode: the body as given, no data version; each answer read by status, code and field", async () => {
    expect(await run(OK)).toEqual({ kind: "done" });
    expect(await run(http(400, "VALIDATION_FAILED", { fields: ["reportedOn", "note"] }))).toEqual({
      kind: "fields",
      fields: ["reportedOn", "note"],
    });
    expect(await run(http(409, "CONCURRENT_MODIFICATION"))).toEqual({ kind: "concurrent" });
    for (const [status, code] of [
      [403, "FORBIDDEN"],
      [403, "AGREEMENT_ASSIGNEE_ONLY"],
      [403, "AGREEMENT_TERMINATION_NOT_ALLOWED"],
      [409, "AGREEMENT_ENDED"],
    ] as const) {
      expect(await run(http(status, code))).toEqual({ kind: "changed", code });
    }
    expect(await run(http(404, "NOT_FOUND"))).toEqual({ kind: "notFound" });
    expect(await run(http(400, "MALFORMED_REQUEST"))).toStrictEqual({ kind: "failed" });
    expect(await run(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }))).toEqual({ kind: "failed", correlationId: "c-9" });
    expect(await run({ ok: false, kind: "network" })).toStrictEqual({ kind: "failed" });
  });
});
