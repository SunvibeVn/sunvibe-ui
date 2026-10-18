import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { Territory } from "../types";

import { sendTerritoryChange, type TerritoryFlowDeps } from "./territory-flow";

const saved: Territory = { wardCode: "20242", wardName: "Hải Châu", userId: "U2", userName: "Trần Thị Bình" };

function deps(put: ApiResult<Territory>, del: ApiResult<undefined>) {
  const calls: string[] = [];
  const fake: TerritoryFlowDeps = {
    assignTerritory: async (ward, user) => {
      calls.push(`PUT ${ward} ${user}`);
      return put;
    },
    unassignTerritory: async (ward) => {
      calls.push(`DELETE ${ward}`);
      return del;
    },
  };
  return { calls, fake };
}

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data, status: 200, replayed: false, correlationId: "c" });
const http = (status: number, correlationId?: string): ApiResult<never> => ({
  ok: false,
  kind: "http",
  status,
  code: undefined,
  fieldErrors: [],
  correlationId,
});

describe("sendTerritoryChange", () => {
  it("PUTs the person and returns the saved territory", async () => {
    const { calls, fake } = deps(ok(saved), ok(undefined));
    expect(await sendTerritoryChange("20242", "U2", fake)).toEqual({ ok: true, kind: "saved", saved });
    expect(calls).toEqual(["PUT 20242 U2"]);
  });

  it("DELETEs for a removal and returns no territory", async () => {
    const { calls, fake } = deps(ok(saved), ok(undefined));
    expect(await sendTerritoryChange("20242", null, fake)).toEqual({ ok: true, kind: "removed" });
    expect(calls).toEqual(["DELETE 20242"]);
  });

  it("a removal is told by the request, whatever the answer body holds (CR-6)", async () => {
    const { fake } = deps(ok(saved), { ok: true, data: undefined, status: 204, replayed: false });
    expect(await sendTerritoryChange("20242", null, fake)).toEqual({ ok: true, kind: "removed" });
  });

  it("maps a failure to the territory problem, with the support code", async () => {
    const { fake } = deps(http(422, "c-422"), ok(undefined));
    expect(await sendTerritoryChange("20242", "U9", fake)).toEqual({
      ok: false,
      problem: { kind: "ineligible", correlationId: "c-422" },
    });
  });

  it("maps a failed removal to the generic problem", async () => {
    const { fake } = deps(ok(saved), http(500));
    expect(await sendTerritoryChange("20242", null, fake)).toEqual({ ok: false, problem: { kind: "generic" } });
  });
});
