import { hasAnyRole } from "@/features/auth/client";

/** The roles of the owner check, suspensions and cases (spec 4.3); SUPER_ADMIN counts as ADMIN. */
export const MANAGER_ROLES = ["SALE_LEADER", "SALES_MANAGER", "ADMIN"] as const;

const SALE_ROLES = ["SALE", "SALE_LEADER"] as const;

export type IntakeViewer = {
  /** The lead's assignee with a sale role: the only one who runs the steps; a manager role alone does not. */
  assignee: boolean;
  /** Holds a manager role. Whether they may act on this lead is the server's: it knows who has worked it. */
  manager: boolean;
};

export function intakeViewer(input: { userId: string; roles: readonly string[]; assignedUserId: string | null }): IntakeViewer {
  return {
    assignee: input.assignedUserId === input.userId && hasAnyRole(input.roles, SALE_ROLES),
    manager: hasAnyRole(input.roles, MANAGER_ROLES),
  };
}
