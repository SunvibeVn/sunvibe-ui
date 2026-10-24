import { describe, expect, it } from "vitest";

import type { EligibleAssignee, Territory } from "../types";

import { holderFlag, holderId, prepareTerritoryAssign, territoryProblem } from "./territory-flags";

const eligible: EligibleAssignee[] = [
  { userId: "U1", fullName: "Nguyễn Văn An", roles: ["SALE"] },
  { userId: "U2", fullName: "Trần Thị Bình", roles: ["SALE_LEADER"] },
];

const ward = (extra: Partial<Territory> = {}): Territory => ({
  wardCode: "20242",
  wardName: "Hải Châu",
  wardType: "WARD",
  ...extra,
});

/** A ward as the API sends it when nobody looks after it: the holder fields are null, not left out. */
const emptyWard = (): Territory =>
  JSON.parse('{"wardCode":"20242","wardName":"Hải Châu","wardType":"WARD","userId":null,"userName":null,"assignedAt":null}') as Territory;

describe("holderId", () => {
  it("is the holder's user id", () => {
    expect(holderId(ward({ userId: "U1" }))).toBe("U1");
  });

  it("is undefined when nobody looks after the ward: null, left out or blank", () => {
    expect(holderId(emptyWard())).toBeUndefined();
    expect(holderId(ward())).toBeUndefined();
    expect(holderId(ward({ userId: "" }))).toBeUndefined();
  });
});

describe("holderFlag (C-40)", () => {
  it("is none when nobody looks after the ward", () => {
    expect(holderFlag(ward(), eligible)).toBe("none");
    expect(holderFlag(ward({ userId: undefined, userName: null }), eligible)).toBe("none");
  });

  it("is none for a ward the API sends with a null holder", () => {
    expect(holderFlag(emptyWard(), eligible)).toBe("none");
  });

  it("is none for a blank user id", () => {
    expect(holderFlag(ward({ userId: "" }), eligible)).toBe("none");
  });

  it("is ok when the holder is in the eligible list", () => {
    expect(holderFlag(ward({ userId: "U2", userName: "Trần Thị Bình" }), eligible)).toBe("ok");
  });

  it("is ineligible when the holder is not in the eligible list", () => {
    expect(holderFlag(ward({ userId: "U9", userName: "Lê Văn Cường" }), eligible)).toBe("ineligible");
  });

  it("flags every holder as ineligible against an empty list (the caller skips the flag when the list failed to load)", () => {
    expect(holderFlag(ward({ userId: "U1" }), [])).toBe("ineligible");
  });
});

describe("prepareTerritoryAssign", () => {
  it("needs a person", () => {
    expect(prepareTerritoryAssign("", undefined)).toEqual({ kind: "invalid" });
  });

  it("sends nothing when the person already holds the ward", () => {
    expect(prepareTerritoryAssign("U1", "U1")).toEqual({ kind: "unchanged" });
  });

  it("sends the picked person otherwise", () => {
    expect(prepareTerritoryAssign("U2", "U1")).toEqual({ kind: "send", userId: "U2" });
    expect(prepareTerritoryAssign("U2", undefined)).toEqual({ kind: "send", userId: "U2" });
  });
});

describe("territoryProblem (spec 5.2, E-6, E-7)", () => {
  it("422 is the ineligible assignee, with the support code", () => {
    expect(territoryProblem({ kind: "ineligible", correlationId: "c1" })).toEqual({ kind: "ineligible", correlationId: "c1" });
  });

  it("a 400 naming userId is a field message", () => {
    expect(territoryProblem({ kind: "validation", fieldErrors: { userId: "must not be blank" } })).toEqual({
      kind: "field",
    });
  });

  it("a 400 without userId is the general bad-request message", () => {
    expect(territoryProblem({ kind: "validation", fieldErrors: {}, correlationId: "c2" })).toEqual({
      kind: "bad-request",
      correlationId: "c2",
    });
    expect(territoryProblem({ kind: "validation", fieldErrors: { other: "x" } }).kind).toBe("bad-request");
  });

  it("403 is forbidden", () => {
    expect(territoryProblem({ kind: "forbidden" }).kind).toBe("forbidden");
  });

  it("everything else is the generic message", () => {
    for (const kind of ["retry", "not-found", "stale", "invalid-transition", "signed-out", "unavailable"] as const) {
      expect(territoryProblem({ kind }).kind).toBe("generic");
    }
  });
});
