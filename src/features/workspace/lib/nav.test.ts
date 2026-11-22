import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";
import { STAFF_WORKSPACE_ROLES, WORKSPACE_HOME, isStaff, pageRolesOf, workspaceNav } from "./nav";
import { WORKSPACE_ROLES } from "./routes";

const OWNER_LEADS = { href: "/workspace/owner-leads", labelKey: "ownerLeads" };
const SURVEYS = { href: "/workspace/surveys", labelKey: "surveys" };
const AGREEMENTS = { href: "/workspace/brokerage-agreements", labelKey: "brokerageAgreements" };
const RECONFIRMATIONS = { href: "/workspace/listings/reconfirmations", labelKey: "listingReconfirmations" };
const LISTING_REVIEWS = { href: "/workspace/listings/reviews", labelKey: "listingReviews" };
const CASES = { href: "/workspace/inventory-cases", labelKey: "inventoryCases" };
const TERRITORIES = { href: "/workspace/settings/territories", labelKey: "territories" };

describe("workspaceNav", () => {
  it("workspaceNav_sale_ownerLeadsAndSurveys", () => {
    expect(workspaceNav(["SALE"])).toEqual([OWNER_LEADS, SURVEYS, AGREEMENTS, RECONFIRMATIONS]);
  });

  it("workspaceNav_saleLeaderAndSalesManager_addCases", () => {
    expect(workspaceNav(["SALE_LEADER"])).toEqual([OWNER_LEADS, SURVEYS, AGREEMENTS, RECONFIRMATIONS, LISTING_REVIEWS, CASES]);
    expect(workspaceNav(["SALES_MANAGER"])).toEqual([OWNER_LEADS, SURVEYS, AGREEMENTS, RECONFIRMATIONS, LISTING_REVIEWS, CASES]);
  });

  it("workspaceNav_admin_addsCasesAndTerritories", () => {
    expect(workspaceNav(["ADMIN"])).toEqual([OWNER_LEADS, SURVEYS, AGREEMENTS, RECONFIRMATIONS, LISTING_REVIEWS, CASES, TERRITORIES]);
  });

  it("workspaceNav_superAdmin_countsAsAdmin", () => {
    expect(workspaceNav(["SUPER_ADMIN"])).toEqual([OWNER_LEADS, SURVEYS, AGREEMENTS, RECONFIRMATIONS, LISTING_REVIEWS, CASES, TERRITORIES]);
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
    expect(labels(["ADMIN"])).toEqual(["SUPPLY LEADS", "SURVEYS", "AGREEMENTS", "RECONFIRMATIONS", "LISTING REVIEWS", "INVENTORY CASES", "TERRITORIES"]);
  });

  it("the manager roles see INVENTORY CASES (property-create intake 4.3), a Sale does not", () => {
    expect(labels(["SALE_LEADER"])).toEqual(["SUPPLY LEADS", "SURVEYS", "AGREEMENTS", "RECONFIRMATIONS", "LISTING REVIEWS", "INVENTORY CASES"]);
    expect(labels(["SALES_MANAGER"])).toEqual(["SUPPLY LEADS", "SURVEYS", "AGREEMENTS", "RECONFIRMATIONS", "LISTING REVIEWS", "INVENTORY CASES"]);
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

describe("the listing reviewer's way in (listing-publish E06-S4, E06S4-D16)", () => {
  it("workspaceNav_reviewerOnly_listingReviewsAlone: a user whose only workspace role is LISTING_REVIEWER sees LISTING REVIEWS alone", () => {
    expect(workspaceNav(["LISTING_REVIEWER"])).toEqual([LISTING_REVIEWS]);
    expect(workspaceNav(["CUSTOMER", "LISTING_REVIEWER"])).toEqual([LISTING_REVIEWS]);
    expect(workspaceNav(["LISTING_REVIEWER"]).map((item) => en.Workspace.menu[item.labelKey])).toEqual(["LISTING REVIEWS"]);
  });

  it("workspaceNav_saleWithReviewerRole_addsListingReviews: a SALE who also reviews gets the item after RECONFIRMATIONS", () => {
    expect(workspaceNav(["SALE", "LISTING_REVIEWER"])).toEqual([OWNER_LEADS, SURVEYS, AGREEMENTS, RECONFIRMATIONS, LISTING_REVIEWS]);
  });

  it("pageRolesOf_reviewPaths_workspaceRoles: the queue and a revision's review page admit the workspace roles, the reviewer among them", () => {
    for (const path of [
      "/workspace/listings/reviews",
      "/workspace/listings/01JG000000000000000000000L/revisions/2/review",
      "/workspace/listings/01JG000000000000000000000L/revisions/12/review/",
    ]) {
      expect(pageRolesOf(path)).toEqual(WORKSPACE_ROLES);
    }
  });

  it("pageRolesOf_otherPaths_staffRoles: every other workspace page admits the staff roles only (U-22)", () => {
    for (const path of [
      "/workspace",
      "/workspace/owner-leads",
      "/workspace/owner-leads/01JL000000000000000000000L",
      "/workspace/owner-leads/01JL000000000000000000000L/inventory-intake",
      "/workspace/owner-leads/01JL000000000000000000000L/survey-checklists/01JC000000000000000000000C",
      "/workspace/surveys",
      "/workspace/brokerage-agreements",
      "/workspace/brokerage-agreements/01JF000000000000000000000A",
      "/workspace/inventory-cases",
      "/workspace/inventory-cases/01JK000000000000000000000K",
      "/workspace/listings/01JG000000000000000000000L",
      "/workspace/listings/reconfirmations",
      "/workspace/settings/territories",
      // Below or beside the review pages, never one of them.
      "/workspace/listings/reviews/01JG000000000000000000000L",
      "/workspace/listings/01JG000000000000000000000L/revisions/2",
      "/workspace/listings/x/revisions/1/review/other",
    ]) {
      expect(pageRolesOf(path)).toEqual(STAFF_WORKSPACE_ROLES);
    }
  });

  it("workspaceRoles_staffRolesAndReviewer_inOrder: the shell's roles are the staff roles, then LISTING_REVIEWER", () => {
    expect([...WORKSPACE_ROLES]).toEqual(["SALE", "SALE_LEADER", "SALES_MANAGER", "ADMIN", "LISTING_REVIEWER"]);
  });
});
