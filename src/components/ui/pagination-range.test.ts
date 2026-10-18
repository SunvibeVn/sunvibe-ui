import { describe, expect, it } from "vitest";
import { paginationRange } from "./pagination-range";

describe("paginationRange", () => {
  it("handles an empty result without flagging out of range", () => {
    expect(paginationRange(1, 20, 0)).toEqual({ totalPages: 0, hasPrev: false, hasNext: false, outOfRange: false });
  });

  it("first page of several has next only", () => {
    expect(paginationRange(1, 20, 45)).toEqual({ totalPages: 3, hasPrev: false, hasNext: true, outOfRange: false });
  });

  it("last page has prev only", () => {
    expect(paginationRange(3, 20, 45)).toEqual({ totalPages: 3, hasPrev: true, hasNext: false, outOfRange: false });
  });

  it("flags a page beyond the last", () => {
    const r = paginationRange(4, 20, 45);
    expect(r.outOfRange).toBe(true);
    expect(r.totalPages).toBe(3);
    expect(r.hasNext).toBe(false);
  });

  it.each([0, -1, 1.5, Number.NaN])("flags the invalid page %s of a non-empty result", (page) => {
    expect(paginationRange(page, 20, 45).outOfRange).toBe(true);
  });

  it("an exact multiple does not add an extra page", () => {
    expect(paginationRange(2, 20, 40)).toMatchObject({ totalPages: 2, hasNext: false });
  });
});
