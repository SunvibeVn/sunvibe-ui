import { describe, expect, it } from "vitest";

import type { LeadSummary } from "../types";

import { type LeadRow, toLeadRow } from "./lead-row";

const summary: LeadSummary = {
  id: "01JLEAD0000000000000000001",
  requestCode: "SV-E2EA-AA2J",
  status: "ASSIGNED",
  intent: "SHORT_TERM_RENT",
  contactName: "Nguyễn Văn An",
  provinceCode: "48",
  wardCode: "20263",
  wardName: "Phường Sơn Trà",
  propertyType: "APARTMENT",
  assignedUserId: "01JUSER0000000000000000001",
  assignedUserName: "Trần Bình",
  nextActionAt: "2026-10-01T02:00:00Z",
  possibleDuplicate: true,
  createdAt: "2026-10-22T02:15:00Z",
  lastActivityAt: "2026-10-22T09:40:00Z",
  version: 3,
};

describe("toLeadRow (C-46, C-47, C-49, C-51)", () => {
  it("toLeadRow maps the C-46 fields", () => {
    expect(toLeadRow(summary)).toEqual({
      id: "01JLEAD0000000000000000001",
      code: "SV-E2EA-AA2J",
      owner: "Nguyễn Văn An",
      ward: "Phường Sơn Trà",
      requirementKey: "intent.SHORT_TERM_RENT",
      propertyTypeKey: "propertyType.APARTMENT",
      status: "ASSIGNED",
      created: "22/10/2026 09:15",
      lastUpdate: "22/10/2026 16:40",
      possibleDuplicate: true,
    } satisfies LeadRow);
  });

  it("holds no next action, phone, email, address or assignee (lead-queue BR-7, C-47)", () => {
    const row = toLeadRow({ ...summary, ...{ phone: "0909123456", email: "a@b.vn", address: "1 Lê Lợi" } });
    const keys = Object.keys(row);
    for (const field of ["nextAction", "nextActionAt", "phone", "email", "address", "assignee", "assignedUserName"]) {
      expect(keys).not.toContain(field);
    }
    expect(JSON.stringify(row)).not.toMatch(/0909123456|a@b\.vn|Lê Lợi|Trần Bình/);
  });

  it("gives empty texts and null keys for missing or unknown values", () => {
    expect(toLeadRow({ lastActivityAt: "not a time", intent: "BARTER" as LeadSummary["intent"], propertyType: null })).toEqual({
      id: undefined,
      code: "",
      owner: "",
      ward: "",
      requirementKey: null,
      propertyTypeKey: null,
      status: undefined,
      created: "",
      lastUpdate: "",
      possibleDuplicate: false,
    });
  });
});
