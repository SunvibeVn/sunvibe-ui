import { describe, expect, it } from "vitest";

import type { EligibleAssignee } from "../types";

import { selectedAssignee } from "./assignee-pick";

const list: EligibleAssignee[] = [
  { userId: "U1", fullName: "Nguyễn Văn An", roles: ["SALE"] },
  { userId: "U2", fullName: "Trần Thị Bình", roles: ["SALE_LEADER"] },
];

describe("selectedAssignee (assignee picker preselect)", () => {
  it("takes the person picked by hand when listed", () => {
    expect(selectedAssignee(list, "U2", "U1")).toBe("U2");
  });

  it("falls back to the current holder when nothing was picked", () => {
    expect(selectedAssignee(list, null, "U1")).toBe("U1");
  });

  it("ignores a picked person who dropped out of the list (after a reload)", () => {
    expect(selectedAssignee(list, "U9", "U1")).toBe("U1");
  });

  it("is empty when the current holder is not listed (C-40) or there is none", () => {
    expect(selectedAssignee(list, null, "U9")).toBe("");
    expect(selectedAssignee(list, null, null)).toBe("");
    expect(selectedAssignee(list, null, undefined)).toBe("");
  });

  it("is empty against an empty list", () => {
    expect(selectedAssignee([], "U1", "U1")).toBe("");
  });
});
