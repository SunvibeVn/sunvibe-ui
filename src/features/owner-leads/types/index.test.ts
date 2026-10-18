import { describe, expect, it } from "vitest";

import { isClosedLeadStatus } from "./index";

describe("isClosedLeadStatus (acquisition BR-3)", () => {
  it("is true for the three closed statuses", () => {
    for (const status of ["DUPLICATE", "REJECTED", "WITHDRAWN"]) expect(isClosedLeadStatus(status)).toBe(true);
  });

  it("is false for open, unknown or missing statuses", () => {
    for (const status of ["NEW", "ASSIGNED", "CONTACTED", "ON_HOLD", "QUALIFIED", "", undefined]) {
      expect(isClosedLeadStatus(status)).toBe(false);
    }
  });
});
