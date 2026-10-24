/** The checklist page's two tabs (state in the URL, spec 6.2). */
export type ChecklistTab = "edit" | "preview";

/** `/workspace/owner-leads/<leadId>/survey-checklists/<checklistId>` (A-16), with `?tab=` for the Preview tab. */
export function checklistHref(leadId: string, checklistId: string, tab: ChecklistTab = "edit"): string {
  const path = `/workspace/owner-leads/${encodeURIComponent(leadId)}/survey-checklists/${encodeURIComponent(checklistId)}`;
  return tab === "edit" ? path : `${path}?tab=${tab}`;
}

/** The tab a `tab` search parameter names; Edit for anything else. */
export function tabOf(value: string | null | undefined): ChecklistTab {
  return value === "preview" ? "preview" : "edit";
}
