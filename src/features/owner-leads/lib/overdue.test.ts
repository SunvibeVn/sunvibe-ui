import { describe, expect, it } from "vitest";

import { isOverdue } from "./overdue";

const NOW = new Date("2026-10-18T02:00:00Z");

describe("isOverdue (C-20, W11-26)", () => {
  it("flags an open lead whose next action is past", () => {
    expect(isOverdue({ status: "ASSIGNED", nextActionAt: "2026-10-18T01:59:59Z" }, NOW)).toBe(true);
  });

  it("does not flag an open lead whose next action is in the future", () => {
    expect(isOverdue({ status: "ASSIGNED", nextActionAt: "2026-10-18T02:00:01Z" }, NOW)).toBe(false);
  });

  it("does not flag the exact instant", () => {
    expect(isOverdue({ status: "CONTACTED", nextActionAt: "2026-10-18T02:00:00Z" }, NOW)).toBe(false);
  });

  it("does not flag an open lead without a next action", () => {
    expect(isOverdue({ status: "NEW", nextActionAt: null }, NOW)).toBe(false);
    expect(isOverdue({ status: "NEW" }, NOW)).toBe(false);
  });

  it("does not flag a closed lead even with a past next action", () => {
    expect(isOverdue({ status: "REJECTED", nextActionAt: "2026-01-01T00:00:00Z" }, NOW)).toBe(false);
    expect(isOverdue({ status: "WITHDRAWN", nextActionAt: "2026-01-01T00:00:00Z" }, NOW)).toBe(false);
    expect(isOverdue({ status: "DUPLICATE", nextActionAt: "2026-01-01T00:00:00Z" }, NOW)).toBe(false);
  });

  it("does not flag an unreadable date", () => {
    expect(isOverdue({ status: "ON_HOLD", nextActionAt: "not a date" }, NOW)).toBe(false);
  });
});
