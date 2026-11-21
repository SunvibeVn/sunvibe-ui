import { hasAnyRole } from "@/features/auth/client";
import {
  BROKERAGE_AGREEMENTS_PATH,
  INVENTORY_CASE_ROLES,
  INVENTORY_CASES_PATH,
  LISTING_RECONFIRMATIONS_PATH,
  STAFF_WORKSPACE_ROLES,
  SURVEYS_PATH,
  WORKSPACE_HOME,
} from "./routes";

export { STAFF_WORKSPACE_ROLES, WORKSPACE_HOME };

export type WorkspaceNavItem = {
  href: string;
  /** Key under `Workspace.menu` in en.json. */
  labelKey: "ownerLeads" | "surveys" | "brokerageAgreements" | "listingReconfirmations" | "inventoryCases" | "territories";
};

/** True when the user holds a staff workspace role (SUPER_ADMIN counts as ADMIN). */
export function isStaff(roles: readonly string[]): boolean {
  return hasAnyRole(roles, STAFF_WORKSPACE_ROLES);
}

/**
 * The left menu: the lead queue, the survey list (survey-schedule spec 6.5), the brokerage agreements
 * (brokerage-agreement US-4 AC-3, S7-D12) and the listings to reconfirm (listing-publish US-6 AC-3, E06S3-D13) for every
 * staff role, the inventory cases for the manager roles (property-create intake 4.3), the territories settings for ADMIN
 * only (US-1 AC-1b).
 */
export function workspaceNav(roles: readonly string[]): WorkspaceNavItem[] {
  if (!isStaff(roles)) return [];
  const items: WorkspaceNavItem[] = [
    { href: WORKSPACE_HOME, labelKey: "ownerLeads" },
    { href: SURVEYS_PATH, labelKey: "surveys" },
    { href: BROKERAGE_AGREEMENTS_PATH, labelKey: "brokerageAgreements" },
    { href: LISTING_RECONFIRMATIONS_PATH, labelKey: "listingReconfirmations" },
  ];
  if (hasAnyRole(roles, INVENTORY_CASE_ROLES)) items.push({ href: INVENTORY_CASES_PATH, labelKey: "inventoryCases" });
  if (hasAnyRole(roles, ["ADMIN"])) items.push({ href: "/workspace/settings/territories", labelKey: "territories" });
  return items;
}
