import type { EligibleAssignee } from "../types";

/**
 * The value of an assignee select: the person picked by hand when still listed, else the current assignee when
 * listed, else "" (nothing selected). A picked person who dropped out of the list (a 422 reload) is ignored; a
 * current assignee who is not listed (C-40) is not preselected.
 */
export function selectedAssignee(
  list: readonly EligibleAssignee[],
  picked: string | null,
  currentId: string | null | undefined,
): string {
  const listed = (id: string | null | undefined): id is string =>
    id !== null && id !== undefined && list.some((person) => person.userId === id);
  return listed(picked) ? picked : listed(currentId) ? currentId : "";
}
