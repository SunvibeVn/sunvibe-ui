import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { BrokerageEligibility } from "../types";

import { getEligibility } from "./eligibility-api";

describe("getEligibility (brokerage-agreement E05-S1)", () => {
  it("getEligibility_leadId_readsTheEligibilityPath: one GET of the lead's eligibility, its answer returned as it is", async () => {
    const calls: { path: string; options: unknown }[] = [];
    const client = {
      GET: (path: string, options: unknown) => {
        calls.push({ path, options });
        return Promise.resolve();
      },
    };
    const answer: ApiResult<BrokerageEligibility> = {
      ok: true,
      data: { basisState: "NONE", viewerIsAssignedSale: true, units: [] },
      status: 200,
      replayed: false,
    };
    const callApi = vi.fn(async (run: (c: never) => unknown) => {
      await run(client as never);
      return answer as never;
    });

    const result = await getEligibility("L1", { callApi: callApi as never });

    expect(result).toBe(answer);
    expect(calls).toEqual([
      { path: "/api/v1/staff/owner-leads/{leadId}/brokerage-eligibility", options: { params: { path: { leadId: "L1" } } } },
    ]);
  });
});
