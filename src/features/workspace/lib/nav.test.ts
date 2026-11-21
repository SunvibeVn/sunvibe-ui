import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";
import { STAFF_WORKSPACE_ROLES, WORKSPACE_HOME, isStaff, workspaceNav } from "./nav";

const OWNER_LEADS = { href: "/workspace/owner-leads", labelKey: "ownerLeads" };
const SURVEYS = { href: "/workspace/surveys", labelKey: "surveys" };
const AGREEMENTS = { href: "/workspace/brokerage-agreements", labelKey: "brokerageAgreements" };
const RECONFIRMATIONS = { href: "/workspace/listings/reconfirmations", labelKey: "listingReconfirmations" };
const CASES = { href: "/workspace/inventory-cases", labelKey: "inventoryCases" };
const TERRITORIES = { href: "/workspace/settings/territories", labelKey: "territories" };

describe("workspaceNav", () => {
  it("workspaceNav_sale_ownerLeadsAndSurveys", () => {
    expect(workspaceNav(["SALE"])).toEqual([OWNER_LEADS, SURVEYS, AGREEMENTS, RECONFIRMATIONS]);
  });

  it("workspaceNav_saleLeaderAndSalesManager_addCases", () => {
    expect(workspaceNav(["SALE_LEADER"])).toEqual([OWNER_LEADS, SURVEYS, AGREEMENTS, RECONFIRMATIONS, CASES]);
    expect(workspaceNav(["SALES_MANAGER"])).toEqual([OWNER_LEADS, SURVEYS, AGREEMENTS, RECONFIRMATIONS, CASES]);
  });

  it("workspaceNav_admin_addsCasesAndTerritories", () => {
    expect(workspaceNav(["ADMIN"])).toEqual([OWNER_LEADS, SURVEYS, AGREEMENTS, RECONFIRMATIONS, CASES, TERRITORIES]);
  });

  it("workspaceNav_superAdmin_countsAsAdmin", () => {
    expect(workspaceNav(["SUPER_ADMIN"])).toEqual([OWNER_LEADS, SURVEYS, AGREEMENTS, RECONFIRMATIONS, CASES, TERRITORIES]);
  });

  it("workspaceNav_customerOrNoRole_isEmpty", () => {
    expect(workspaceNav(["CUSTOMER"])).toEqual([]);
    expect(workspaceNav([])).toEqual([]);
  });
});

describe("workspaceNav labels (C-42, A-4)", () => {
  const labels = (roles: string[]) => workspaceNav(roles).map((item) => en.Workspace.menu[item.labelKey]);

  it("SALE sees SUPPLY LEADS and SURVEYS, ADMIN also TERRITORIES (survey-schedule spec 6.5)", () => {
    expect(labels(["SALE"])).toEqual(["SUPPLY LEADS", "SURVEYS", "AGREEMENTS", "RECONFIRMATIONS"]);
    expect(labels(["ADMIN"])).toEqual(["SUPPLY LEADS", "SURVEYS", "AGREEMENTS", "RECONFIRMATIONS", "INVENTORY CASES", "TERRITORIES"]);
  });

  it("the manager roles see INVENTORY CASES (property-create intake 4.3), a Sale does not", () => {
    expect(labels(["SALE_LEADER"])).toEqual(["SUPPLY LEADS", "SURVEYS", "AGREEMENTS", "RECONFIRMATIONS", "INVENTORY CASES"]);
    expect(labels(["SALES_MANAGER"])).toEqual(["SUPPLY LEADS", "SURVEYS", "AGREEMENTS", "RECONFIRMATIONS", "INVENTORY CASES"]);
    expect(labels(["SUPER_ADMIN"])).toContain("INVENTORY CASES");
    expect(labels(["SALE"])).not.toContain("INVENTORY CASES");
  });

  it("workspaceNav_labels_noneHoldsAnother: no menu label holds another, so a link found by a partial name is the one meant (E06S3-P6)", () => {
    const holding = (roles: string[]) => {
      const names = labels(roles).map((label) => label.toLowerCase());
      return names.flatMap((name, index) => names.filter((other, at) => at !== index && name.includes(other)).map((other) => `${name} holds ${other}`));
    };
    expect(["SALE", "SALE_LEADER", "SALES_MANAGER", "ADMIN"].map((role) => holding([role]))).toEqual([[], [], [], []]);
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
