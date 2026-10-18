import { describe, expect, it } from "vitest";

import { detailFailureAction } from "./detail-failure";

describe("detailFailureAction (spec 5.2: what a failed detail GET does)", () => {
  it("404 goes back to the list with the notice (C-37)", () => {
    expect(detailFailureAction({ kind: "not-found" })).toBe("leave-to-list");
  });

  it("403 shows the forbidden notice in place, not the not-found flash (CR-9, E-2)", () => {
    expect(detailFailureAction({ kind: "forbidden", correlationId: "c-1" })).toBe("forbidden");
  });

  it("signed-out and unavailable are left to RequireSession (the page keeps what it has)", () => {
    expect(detailFailureAction({ kind: "signed-out" })).toBe("session");
    expect(detailFailureAction({ kind: "unavailable" })).toBe("session");
  });

  it("everything else shows the load problem with a retry", () => {
    for (const kind of ["retry", "stale", "invalid-transition", "ineligible", "validation"] as const) {
      expect(detailFailureAction({ kind })).toBe("problem");
    }
  });
});
