import { describe, expect, it } from "vitest";
import { isFuture } from "./signup-progress";

describe("isFuture", () => {
  it("is true only for a time still ahead", () => {
    expect(isFuture(new Date(Date.now() + 60_000).toISOString())).toBe(true);
    expect(isFuture(new Date(Date.now() - 60_000).toISOString())).toBe(false);
  });

  it("is false when there is no time or it is not a date", () => {
    expect(isFuture(undefined)).toBe(false);
    expect(isFuture("not a date")).toBe(false);
  });
});
