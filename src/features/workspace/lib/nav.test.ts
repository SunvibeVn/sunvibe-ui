import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";
import { STAFF_WORKSPACE_ROLES, WORKSPACE_HOME, isStaff, workspaceNav } from "./nav";

const OWNER_LEADS = { href: "/workspace/owner-leads", labelKey: "ownerLeads" };
const TERRITORIES = { href: "/workspace/settings/territories", labelKey: "territories" };

describe("workspaceNav", () => {
  it("workspaceNav_sale_ownerLeadsOnly", () => {
    expect(workspaceNav(["SALE"])).toEqual([OWNER_LEADS]);
  });

  it("workspaceNav_saleLeaderAndSalesManager_ownerLeadsOnly", () => {
    expect(workspaceNav(["SALE_LEADER"])).toEqual([OWNER_LEADS]);
    expect(workspaceNav(["SALES_MANAGER"])).toEqual([OWNER_LEADS]);
  });

  it("workspaceNav_admin_addsTerritories", () => {
    expect(workspaceNav(["ADMIN"])).toEqual([OWNER_LEADS, TERRITORIES]);
  });

  it("workspaceNav_superAdmin_countsAsAdmin", () => {
    expect(workspaceNav(["SUPER_ADMIN"])).toEqual([OWNER_LEADS, TERRITORIES]);
  });

  it("workspaceNav_customerOrNoRole_isEmpty", () => {
    expect(workspaceNav(["CUSTOMER"])).toEqual([]);
    expect(workspaceNav([])).toEqual([]);
  });
});

describe("workspaceNav labels (C-42, A-4)", () => {
  const labels = (roles: string[]) => workspaceNav(roles).map((item) => en.Workspace.menu[item.labelKey]);

  it("SALE sees SUPPLY LEADS, ADMIN also TERRITORIES", () => {
    expect(labels(["SALE"])).toEqual(["SUPPLY LEADS"]);
    expect(labels(["ADMIN"])).toEqual(["SUPPLY LEADS", "TERRITORIES"]);
  });
});

describe("staff roles", () => {
  it("STAFF_WORKSPACE_ROLES_isTheFourWorkspaceRoles", () => {
    expect([...STAFF_WORKSPACE_ROLES]).toEqual(["SALE", "SALE_LEADER", "SALES_MANAGER", "ADMIN"]);
  });

  it("isStaff_staffRolesAndSuperAdmin_true", () => {
    expect(isStaff(["SALE"])).toBe(true);
    expect(isStaff(["CUSTOMER", "SALES_MANAGER"])).toBe(true);
    expect(isStaff(["SUPER_ADMIN"])).toBe(true);
  });

  it("isStaff_otherRoles_false", () => {
    expect(isStaff(["CUSTOMER"])).toBe(false);
    expect(isStaff(["LANDLORD", "BROKER"])).toBe(false);
    expect(isStaff([])).toBe(false);
  });

  it("WORKSPACE_HOME_isOwnerLeads", () => {
    expect(WORKSPACE_HOME).toBe("/workspace/owner-leads");
  });
});
