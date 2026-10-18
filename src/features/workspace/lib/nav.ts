import { hasAnyRole } from "@/features/auth/client";
import { STAFF_WORKSPACE_ROLES, WORKSPACE_HOME } from "./routes";

export { STAFF_WORKSPACE_ROLES, WORKSPACE_HOME };

export type WorkspaceNavItem = {
  href: string;
  /** Key under `Workspace.menu` in vi.json. */
  labelKey: "ownerLeads" | "territories";
};

/** True when the user holds a staff workspace role (SUPER_ADMIN counts as ADMIN). */
export function isStaff(roles: readonly string[]): boolean {
  return hasAnyRole(roles, STAFF_WORKSPACE_ROLES);
}

/** The left menu: the lead queue for every staff role, the territories settings for ADMIN only (US-1 AC-1b). */
export function workspaceNav(roles: readonly string[]): WorkspaceNavItem[] {
  if (!isStaff(roles)) return [];
  const items: WorkspaceNavItem[] = [{ href: WORKSPACE_HOME, labelKey: "ownerLeads" }];
  if (hasAnyRole(roles, ["ADMIN"])) items.push({ href: "/workspace/settings/territories", labelKey: "territories" });
  return items;
}
