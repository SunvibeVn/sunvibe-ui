import { describe, expect, it } from "vitest";

import type { EligibleAssignee, LeadSummary } from "../types";

import { assigneeFilterLabel } from "./assignee-filter-label";

const AT = "2026-10-20T03:00:00Z";

const eligible: EligibleAssignee[] = [
  { userId: "U1", fullName: "Nguyễn Văn An", roles: ["SALE"] },
  { userId: "U2", fullName: "Trần Thị Bình", roles: ["SALE_LEADER"] },
];

describe("assigneeFilterLabel (W11-29, C-34)", () => {
  it("names an eligible assignee without the former-holder mark", () => {
    expect(assigneeFilterLabel("U2", eligible, [])).toEqual({ name: "Trần Thị Bình", formerHolder: false });
  });

  it("prefers the eligible list over a row", () => {
    const rows: LeadSummary[] = [{ assignedUserId: "U1", assignedUserName: "Tên cũ", lastActivityAt: AT }];
    expect(assigneeFilterLabel("U1", eligible, rows)).toEqual({ name: "Nguyễn Văn An", formerHolder: false });
  });

  it("takes the name of a returned row for a user who no longer takes leads", () => {
    const rows: LeadSummary[] = [
      { assignedUserId: "U9", assignedUserName: "Lê Văn Cũ", lastActivityAt: AT },
      { assignedUserId: "U1", assignedUserName: "Nguyễn Văn An", lastActivityAt: AT },
    ];
    expect(assigneeFilterLabel("U9", eligible, rows)).toEqual({ name: "Lê Văn Cũ", formerHolder: true });
  });

  it("skips rows without a usable name", () => {
    const rows: LeadSummary[] = [
      { assignedUserId: "U9", assignedUserName: null, lastActivityAt: AT },
      { assignedUserId: "U9", assignedUserName: "", lastActivityAt: AT },
      { assignedUserId: "U9", assignedUserName: "Lê Văn Cũ", lastActivityAt: AT },
    ];
    expect(assigneeFilterLabel("U9", eligible, rows)).toEqual({ name: "Lê Văn Cũ", formerHolder: true });
  });

  it("is null when neither list knows the user (the UI shows 'Other staff member')", () => {
    expect(assigneeFilterLabel("U9", eligible, [])).toBeNull();
    expect(assigneeFilterLabel("U9", eligible, [{ assignedUserId: "U1", assignedUserName: "Nguyễn Văn An", lastActivityAt: AT }])).toBeNull();
    expect(assigneeFilterLabel("U9", [], [])).toBeNull();
  });

  it("ignores an eligible entry that has no name", () => {
    expect(assigneeFilterLabel("U3", [{ userId: "U3", roles: ["SALE"] }], [])).toBeNull();
  });

  it("with no eligible list yet (null) never marks a former holder: row name, else null", () => {
    const rows: LeadSummary[] = [{ assignedUserId: "U1", assignedUserName: "Nguyễn Văn An", lastActivityAt: AT }];
    expect(assigneeFilterLabel("U1", null, rows)).toEqual({ name: "Nguyễn Văn An", formerHolder: false });
    expect(assigneeFilterLabel("U9", null, rows)).toBeNull();
    expect(assigneeFilterLabel("U1", null, [])).toBeNull();
  });
});
