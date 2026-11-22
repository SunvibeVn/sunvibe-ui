import { hasAnyRole } from "@/features/auth/client";
import {
  BROKERAGE_AGREEMENTS_PATH,
  INVENTORY_CASE_ROLES,
  INVENTORY_CASES_PATH,
  LISTING_RECONFIRMATIONS_PATH,
  LISTING_REVIEW_ROLES,
  LISTING_REVIEWS_PATH,
  STAFF_WORKSPACE_ROLES,
  SURVEYS_PATH,
  WORKSPACE_HOME,
  WORKSPACE_ROLES,
} from "./routes";

export { STAFF_WORKSPACE_ROLES, WORKSPACE_HOME };

export type WorkspaceNavItem = {
  href: string;
  /** Key under `Workspace.menu` in en.json. */
  labelKey:
    | "ownerLeads"
    | "surveys"
    | "brokerageAgreements"
    | "listingReconfirmations"
    | "listingReviews"
    | "inventoryCases"
    | "territories";
};

const LISTING_REVIEWS_ITEM: WorkspaceNavItem = { href: LISTING_REVIEWS_PATH, labelKey: "listingReviews" };

/** A revision's review page: `/workspace/listings/<id>/revisions/<n>/review` (listing-publish E06-S4). */
const REVIEW_PAGE = /^\/workspace\/listings\/[^/]+\/revisions\/[^/]+\/review\/?$/;

/** True when the user holds a staff workspace role (SUPER_ADMIN counts as ADMIN). */
export function isStaff(roles: readonly string[]): boolean {
  return hasAnyRole(roles, STAFF_WORKSPACE_ROLES);
}

/**
 * The left menu: the lead queue, the survey list (survey-schedule spec 6.5), the brokerage agreements
 * (brokerage-agreement US-4 AC-3, S7-D12) and the listings to reconfirm (listing-publish US-6 AC-3, E06S3-D13) for every
 * staff role, the listing reviews for the roles that read the review queue (listing-publish E06-S4, E06S4-D16), the
 * inventory cases for the manager roles (property-create intake 4.3), the territories settings for ADMIN only
 * (US-1 AC-1b). A user whose only workspace role is LISTING_REVIEWER gets the listing reviews alone.
 */
export function workspaceNav(roles: readonly string[]): WorkspaceNavItem[] {
  if (!isStaff(roles)) return hasAnyRole(roles, ["LISTING_REVIEWER"]) ? [LISTING_REVIEWS_ITEM] : [];
  const items: WorkspaceNavItem[] = [
    { href: WORKSPACE_HOME, labelKey: "ownerLeads" },
    { href: SURVEYS_PATH, labelKey: "surveys" },
    { href: BROKERAGE_AGREEMENTS_PATH, labelKey: "brokerageAgreements" },
    { href: LISTING_RECONFIRMATIONS_PATH, labelKey: "listingReconfirmations" },
  ];
  if (hasAnyRole(roles, LISTING_REVIEW_ROLES)) items.push(LISTING_REVIEWS_ITEM);
  if (hasAnyRole(roles, INVENTORY_CASE_ROLES)) items.push({ href: INVENTORY_CASES_PATH, labelKey: "inventoryCases" });
  if (hasAnyRole(roles, ["ADMIN"])) items.push({ href: "/workspace/settings/territories", labelKey: "territories" });
  return items;
}

/**
 * The roles a workspace page admits inside the frame (E06S4-D16): the review queue and a revision's review page admit
 * every workspace role, the listing reviewer among them; every other page the staff roles only, so a reviewer-only
 * user meets the 403 screen there before the page mounts. A UX gate only: the API decides every call.
 */
export function pageRolesOf(pathname: string): readonly string[] {
  if (pathname === LISTING_REVIEWS_PATH || REVIEW_PAGE.test(pathname)) return WORKSPACE_ROLES;
  return STAFF_WORKSPACE_ROLES;
}
