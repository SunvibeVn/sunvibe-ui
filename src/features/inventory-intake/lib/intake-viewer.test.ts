import { describe, expect, it } from "vitest";

import { intakeViewer } from "./intake-viewer";

describe("intakeViewer", () => {
  it("the assignee acts when they hold a sale role", () => {
    expect(intakeViewer({ userId: "U1", roles: ["SALE"], assignedUserId: "U1" }).assignee).toBe(true);
    expect(intakeViewer({ userId: "U1", roles: ["SALE_LEADER"], assignedUserId: "U1" }).assignee).toBe(true);
  });

  it("a manager role alone does not make an assignee act (spec 4.3)", () => {
    expect(intakeViewer({ userId: "U1", roles: ["ADMIN"], assignedUserId: "U1" }).assignee).toBe(false);
    expect(intakeViewer({ userId: "U1", roles: ["SALES_MANAGER"], assignedUserId: "U1" }).assignee).toBe(false);
  });

  it("nobody acts on a lead with another assignee, or none", () => {
    expect(intakeViewer({ userId: "U1", roles: ["SALE"], assignedUserId: "U2" }).assignee).toBe(false);
    expect(intakeViewer({ userId: "U1", roles: ["SALE"], assignedUserId: null }).assignee).toBe(false);
  });

  it("names the manager roles of 4.3, SUPER_ADMIN by the hierarchy", () => {
    for (const role of ["SALE_LEADER", "SALES_MANAGER", "ADMIN", "SUPER_ADMIN"]) {
      expect(intakeViewer({ userId: "U1", roles: [role], assignedUserId: null }).manager).toBe(true);
    }
    expect(intakeViewer({ userId: "U1", roles: ["SALE"], assignedUserId: null }).manager).toBe(false);
  });
});
