import { hasAnyRole } from "@/features/auth/client";
import { STAFF_WORKSPACE_ROLES, SURVEYS_PATH, WORKSPACE_HOME } from "./routes";

export { STAFF_WORKSPACE_ROLES, WORKSPACE_HOME };

export type WorkspaceNavItem = {
  href: string;
  /** Key under `Workspace.menu` in en.json. */
  labelKey: "ownerLeads" | "surveys" | "territories";
};

/** True when the user holds a staff workspace role (SUPER_ADMIN counts as ADMIN). */
export function isStaff(roles: readonly string[]): boolean {
  return hasAnyRole(roles, STAFF_WORKSPACE_ROLES);
}

/**
 * The left menu: the lead queue and the survey list for every staff role (survey-schedule spec 6.5), the territories
 * settings for ADMIN only (US-1 AC-1b).
 */
export function workspaceNav(roles: readonly string[]): WorkspaceNavItem[] {
  if (!isStaff(roles)) return [];
  const items: WorkspaceNavItem[] = [
    { href: WORKSPACE_HOME, labelKey: "ownerLeads" },
    { href: SURVEYS_PATH, labelKey: "surveys" },
  ];
  if (hasAnyRole(roles, ["ADMIN"])) items.push({ href: "/workspace/settings/territories", labelKey: "territories" });
  return items;
}
