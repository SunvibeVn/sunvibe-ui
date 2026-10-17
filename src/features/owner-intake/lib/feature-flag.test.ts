import { describe, expect, it } from "vitest";

import { isOwnerIntakeEnabled } from "./feature-flag";

describe("isOwnerIntakeEnabled", () => {
  it("is on only for the exact value true", () => {
    expect(isOwnerIntakeEnabled("true")).toBe(true);
  });

  it.each([undefined, "", "false", "TRUE", "1", " true", "yes"])("is off for %j", (value) => {
    expect(isOwnerIntakeEnabled(value)).toBe(false);
  });
});
