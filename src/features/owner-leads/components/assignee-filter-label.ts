import type { EligibleAssignee, LeadSummary } from "../types";

export type AssigneeFilterLabel = {
  name: string;
  /** True when the user is no longer in the eligible list: shown as "(no longer takes leads)" (C-34). */
  formerHolder: boolean;
};

function usableName(name: string | null | undefined): name is string {
  return typeof name === "string" && name.trim() !== "";
}

/**
 * The label of the assignee named in the URL (W11-29, C-34). An eligible user shows with the name of the list; a user
 * who is no longer eligible takes the `assignedUserName` of a returned row and is marked as a former holder; when
 * neither knows the user it is null and the UI shows "Other staff member". `eligible` is null while that list is not
 * loaded (or failed to load): then nobody can be called a former holder, so a row's name comes back unmarked.
 */
export function assigneeFilterLabel(
  assigneeId: string,
  eligible: readonly EligibleAssignee[] | null,
  rows: readonly LeadSummary[],
): AssigneeFilterLabel | null {
  const current = eligible?.find((person) => person.userId === assigneeId && usableName(person.fullName));
  if (current?.fullName !== undefined) return { name: current.fullName, formerHolder: false };
  const row = rows.find((lead) => lead.assignedUserId === assigneeId && usableName(lead.assignedUserName));
  if (row?.assignedUserName) return { name: row.assignedUserName, formerHolder: eligible !== null };
  return null;
}
