import { describe, expect, it } from "vitest";

import { assigneeOption } from "./assignee-option";

describe("assigneeOption (C-29)", () => {
  it("shows a SALE with the Sale role", () => {
    expect(assigneeOption({ userId: "U1", fullName: "Nguyễn Văn An", roles: ["SALE"] })).toEqual({
      name: "Nguyễn Văn An",
      roleKey: "role.SALE",
    });
  });

  it("shows a SALE_LEADER with the leader role", () => {
    expect(assigneeOption({ userId: "U2", fullName: "Trần Thị Bình", roles: ["SALE_LEADER"] })).toEqual({
      name: "Trần Thị Bình",
      roleKey: "role.SALE_LEADER",
    });
  });

  it("lets SALE_LEADER win whatever the order of the roles", () => {
    expect(assigneeOption({ userId: "U3", fullName: "Lê Văn Cường", roles: ["SALE", "SALE_LEADER"] }).roleKey).toBe(
      "role.SALE_LEADER",
    );
    expect(assigneeOption({ userId: "U3", fullName: "Lê Văn Cường", roles: ["SALE_LEADER", "SALE"] }).roleKey).toBe(
      "role.SALE_LEADER",
    );
  });

  it("falls back to Sale without roles and to no name (the UI says 'Không rõ') without a usable name", () => {
    expect(assigneeOption({ userId: "U5" })).toEqual({ name: null, roleKey: "role.SALE" });
    expect(assigneeOption({ userId: "U6", fullName: "  ", roles: ["SALE"] })).toEqual({
      name: null,
      roleKey: "role.SALE",
    });
  });

  it("keeps a name with '$' patterns as typed", () => {
    expect(assigneeOption({ userId: "U4", fullName: "A $& B", roles: ["SALE"] }).name).toBe("A $& B");
  });
});
