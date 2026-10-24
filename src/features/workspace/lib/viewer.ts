import { hasAnyRole } from "@/features/auth/client";

/** A tab of the lead or survey list ("My Leads", "All Leads"); also the `scope` the list APIs take. */
export type Scope = "mine" | "all";

/** What the signed-in staff member may see in the lead list (spec 5.3). A UX gate only: the API decides (BR-1). */
export type Viewer = {
  /** `ALL` = every lead (SALE_LEADER, SALES_MANAGER, ADMIN); `OWN` = only the leads given to the user. */
  access: "ALL" | "OWN";
  /** Holds SALE or SALE_LEADER, so leads can be given to the user. */
  canHoldLeads: boolean;
  /** Holds ADMIN (SUPER_ADMIN counts as ADMIN). */
  isAdmin: boolean;
  /** Tabs the user may open, in display order. Never empty. */
  tabs: Scope[];
  /** Tab shown when the URL names none, or one the user may not open. */
  defaultScope: Scope;
};

const ALL_ACCESS_ROLES = ["SALE_LEADER", "SALES_MANAGER", "ADMIN"] as const;
const LEAD_HOLDER_ROLES = ["SALE", "SALE_LEADER"] as const;

/**
 * Viewer access from the user's roles, as the server's `LeadViewerConverter`: `ALL` with SALE_LEADER, SALES_MANAGER
 * or ADMIN, else `OWN`. "My Leads" only for SALE / SALE_LEADER (C-38); "All Leads" only for `ALL`, and the default tab
 * of `ALL` viewers (C-44).
 * A user without any workspace role (never let in by the route guard) gets the narrowest view: `OWN` on "mine".
 */
export function viewerOf(roles: readonly string[]): Viewer {
  const access = hasAnyRole(roles, ALL_ACCESS_ROLES) ? "ALL" : "OWN";
  const canHoldLeads = hasAnyRole(roles, LEAD_HOLDER_ROLES);
  const tabs: Scope[] = [];
  if (canHoldLeads) tabs.push("mine");
  if (access === "ALL") tabs.push("all");
  if (tabs.length === 0) tabs.push("mine");
  return {
    access,
    canHoldLeads,
    isAdmin: hasAnyRole(roles, ["ADMIN"]),
    tabs,
    defaultScope: access === "ALL" ? "all" : "mine",
  };
}
