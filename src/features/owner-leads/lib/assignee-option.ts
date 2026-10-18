import type { EligibleAssignee } from "../types";

import { type OwnerLeadsKey, ROLE_LABEL } from "./labels";

/** The parts of an assignee option; the UI renders them with `assignDialog.assigneeOption` ("<tên> · <vai trò>"). */
export type AssigneeOption = {
  /** The full name; null when there is no usable name (the UI shows "Không rõ"). */
  name: string | null;
  roleKey: OwnerLeadsKey;
};

/**
 * One rule for every assignee picker and filter (C-29): full name and role, never email or phone. Someone holding
 * SALE_LEADER is "Trưởng nhóm sale" (also with SALE, in any order); everyone else is "Sale".
 */
export function assigneeOption(assignee: EligibleAssignee): AssigneeOption {
  return {
    name: assignee.fullName?.trim() ? assignee.fullName : null,
    roleKey: assignee.roles?.includes("SALE_LEADER") ? ROLE_LABEL.SALE_LEADER : ROLE_LABEL.SALE,
  };
}
