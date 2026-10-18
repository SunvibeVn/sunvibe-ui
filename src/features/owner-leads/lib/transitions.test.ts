import { describe, expect, it } from "vitest";

import { CLOSED_STATUSES, OPEN_STATUSES } from "../types";

import { allowedTargets, isClosing } from "./transitions";

describe("allowedTargets (acquisition BR-3, W11-32)", () => {
  it("NEW can only be closed", () => {
    expect(allowedTargets("NEW")).toEqual(["DUPLICATE", "REJECTED", "WITHDRAWN"]);
  });

  it("ASSIGNED can be contacted, put on hold or closed", () => {
    expect(allowedTargets("ASSIGNED")).toEqual(["CONTACTED", "ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"]);
  });

  it("CONTACTED can be put on hold or closed", () => {
    expect(allowedTargets("CONTACTED")).toEqual(["ON_HOLD", "DUPLICATE", "REJECTED", "WITHDRAWN"]);
  });

  it("ON_HOLD can go back to CONTACTED or be closed", () => {
    expect(allowedTargets("ON_HOLD")).toEqual(["CONTACTED", "DUPLICATE", "REJECTED", "WITHDRAWN"]);
  });

  it.each(CLOSED_STATUSES)("closed %s has no target", (status) => {
    expect(allowedTargets(status)).toEqual([]);
  });

  it("returns a copy that callers may mutate", () => {
    const first = allowedTargets("NEW");
    first.pop();
    expect(allowedTargets("NEW")).toHaveLength(3);
  });

  it("never offers the status itself or NEW", () => {
    for (const status of OPEN_STATUSES) {
      expect(allowedTargets(status)).not.toContain(status);
      expect(allowedTargets(status)).not.toContain("NEW");
    }
  });
});

describe("isClosing", () => {
  it.each(["DUPLICATE", "REJECTED", "WITHDRAWN"] as const)("%s closes a lead", (status) => {
    expect(isClosing(status)).toBe(true);
  });

  it.each(["NEW", "ASSIGNED", "CONTACTED", "ON_HOLD"] as const)("%s does not close a lead", (status) => {
    expect(isClosing(status)).toBe(false);
  });
});
