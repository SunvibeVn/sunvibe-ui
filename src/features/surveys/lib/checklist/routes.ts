/** The checklist page's tabs (state in the URL, spec 6.2); Review only for a viewer who can review the revision. */
export type ChecklistTab = "edit" | "preview" | "review";

/** `/workspace/owner-leads/<leadId>/survey-checklists/<checklistId>` (A-16), with `?tab=` for the other tabs. */
export function checklistHref(leadId: string, checklistId: string, tab: ChecklistTab = "edit"): string {
  const path = `/workspace/owner-leads/${encodeURIComponent(leadId)}/survey-checklists/${encodeURIComponent(checklistId)}`;
  return tab === "edit" ? path : `${path}?tab=${tab}`;
}

/** The tab a `tab` search parameter names; Edit for anything else. */
export function tabOf(value: string | null | undefined): ChecklistTab {
  return value === "preview" || value === "review" ? value : "edit";
}
