import { isLeadStatus, isOpenStatus, type LeadSummary, type OpenLeadStatus } from "@/features/lead-shared";

/**
 * One selected row of "All Leads", as the list answer showed it (acquisition-owner-lead-bulk-assign D-8): the request is
 * built from `id` and `version`, the dialog's summary from `assignedUserId` and `status`, the result lines from
 * `requestCode`. Never a phone, email, address or name.
 */
export type SelectedLead = {
  id: string;
  requestCode: string;
  version: number;
  assignedUserId: string | null;
  status: OpenLeadStatus;
};

/** The selected rows, always in the order of the page's rows. */
export type LeadSelection = readonly SelectedLead[];

export const NO_SELECTION: LeadSelection = Object.freeze([]);

/**
 * The selection with the list answer it was made on. It counts only while that answer is the one on screen
 * (`selectionOf`), so a reload, another URL or another user starts with nothing selected (acquisition-owner-lead-bulk-
 * assign spec 6.2) without an effect that clears it.
 */
export type OwnedSelection = { of: object | null; leads: LeadSelection };

/**
 * The snapshot of a row that may be selected: an open lead (acquisition-owner-lead-bulk-assign BR-2) with an id and a
 * version; null for a closed lead, a status the workspace does not know, or a row without an id or a version.
 */
export function selectable(lead: LeadSummary): SelectedLead | null {
  const { id, version, status } = lead;
  if (typeof id !== "string" || id === "" || typeof version !== "number") return null;
  if (!isLeadStatus(status) || !isOpenStatus(status)) return null;
  return { id, requestCode: lead.requestCode ?? "", version, assignedUserId: lead.assignedUserId ?? null, status };
}

export function isSelected(selection: LeadSelection, leadId: string): boolean {
  return selection.some((selected) => selected.id === leadId);
}

/** The selectable rows of `rows` whose id is in `ids`, in row order. */
function pick(rows: readonly LeadSummary[], ids: ReadonlySet<string>): LeadSelection {
  const picked: SelectedLead[] = [];
  for (const row of rows) {
    const selected = selectable(row);
    if (selected !== null && ids.has(selected.id)) picked.push(selected);
  }
  return picked.length === 0 ? NO_SELECTION : picked;
}

/** Selects or unselects one row of the page; a row that cannot be selected leaves the selection as it is. */
export function toggle(selection: LeadSelection, rows: readonly LeadSummary[], leadId: string): LeadSelection {
  const row = rows.find((candidate) => candidate.id === leadId);
  if (row === undefined || selectable(row) === null) return selection;
  const ids = new Set(selection.map((selected) => selected.id));
  if (ids.has(leadId)) ids.delete(leadId);
  else ids.add(leadId);
  return pick(rows, ids);
}

/** Every selectable row of the page, or none when all of them were selected (acquisition-owner-lead-bulk-assign BR-3). */
export function toggleAllOnPage(selection: LeadSelection, rows: readonly LeadSummary[]): LeadSelection {
  if (pageCheck(selection, rows) === "checked") return NO_SELECTION;
  const all = new Set<string>();
  for (const row of rows) {
    const selected = selectable(row);
    if (selected !== null) all.add(selected.id);
  }
  return pick(rows, all);
}

export function clear(): LeadSelection {
  return NO_SELECTION;
}

/** The state of the page's select-all box: checked when every selectable row is selected, mixed when some are. */
export function pageCheck(selection: LeadSelection, rows: readonly LeadSummary[]): "checked" | "mixed" | "unchecked" {
  let total = 0;
  let chosen = 0;
  for (const row of rows) {
    const selected = selectable(row);
    if (selected === null) continue;
    total += 1;
    if (isSelected(selection, selected.id)) chosen += 1;
  }
  if (chosen === 0) return "unchecked";
  return chosen === total ? "checked" : "mixed";
}

/** The selected leads held now by a person other than `assigneeId`, who lose access at once (BR-8). */
function othersOf(selection: LeadSelection, assigneeId: string): LeadSelection {
  return selection.filter((selected) => selected.assignedUserId !== null && selected.assignedUserId !== assigneeId);
}

/** How many selected leads belong to someone other than `assigneeId` (acquisition-owner-lead-bulk-assign BR-8). */
export function heldByOthers(selection: LeadSelection, assigneeId: string): number {
  return othersOf(selection, assigneeId).length;
}

/**
 * Of the leads held by someone else, those in Survey Scheduled, whose scheduled survey moves to `assigneeId`
 * (acquisition-owner-lead-bulk-assign D-9, BR-4). A lead already held by `assigneeId` moves nothing.
 */
export function surveyMoves(selection: LeadSelection, assigneeId: string): number {
  return othersOf(selection, assigneeId).filter((selected) => selected.status === "SURVEY_SCHEDULED").length;
}

/** The selection while its answer is the one on screen; nothing for another answer or none (acquisition-owner-lead-bulk-assign P-4). */
export function selectionOf(owned: OwnedSelection, answer: object | null): LeadSelection {
  return answer !== null && owned.of === answer ? owned.leads : NO_SELECTION;
}
