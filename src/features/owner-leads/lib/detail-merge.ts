import type { LeadActivity, LeadDetail, LeadNoteResult, LeadSummary } from "../types";

/**
 * Puts the fields a command answer (`LeadSummary`) carries onto the detail. Status and version stay when the answer
 * has none; the assignee and the next action are taken as given, because an absent value means "nobody" / "none" (a
 * close clears the next action). Everything the summary does not carry (contact data, history, ...) stays.
 */
export function mergeSummary(detail: LeadDetail, summary: LeadSummary): LeadDetail {
  return {
    ...detail,
    status: summary.status ?? detail.status,
    version: summary.version ?? detail.version,
    possibleDuplicate: summary.possibleDuplicate ?? detail.possibleDuplicate,
    nextActionAt: summary.nextActionAt,
    assignedUserId: summary.assignedUserId,
    assignedUserName: summary.assignedUserName,
  };
}

const sameActivity = (a: LeadActivity, b: LeadActivity): boolean =>
  a.type === b.type &&
  a.occurredAt === b.occurredAt &&
  a.note === b.note &&
  a.actorUserId === b.actorUserId &&
  a.nextActionAt === b.nextActionAt;

/**
 * The page after a note 201 (C-36): the new `activity` is appended (once) and the lead fields come from the body's
 * `lead`, so no detail reload is needed.
 */
export function mergeNoteResult(detail: LeadDetail, result: LeadNoteResult): LeadDetail {
  const merged = result.lead === undefined ? detail : mergeSummary(detail, result.lead);
  const { activity } = result;
  if (activity === undefined) return merged;
  const history = merged.activities ?? [];
  if (history.some((entry) => sameActivity(entry, activity))) return merged;
  return { ...merged, activities: [...history, activity] };
}
