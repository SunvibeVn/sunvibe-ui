import type { SurveyCommandResult, SurveyHistoryEntry } from "@/features/surveys";

import { isLeadStatus, type LeadActivity, type LeadDetail, type LeadNoteResult, type LeadSummary } from "../types";

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

const statusOf = (value: string | null | undefined): LeadActivity["toStatus"] =>
  isLeadStatus(value) ? value : undefined;

/** The History row of a survey command answer as a lead activity (survey rows carry no note, only the reference). */
function surveyActivity(entry: NonNullable<SurveyHistoryEntry>): LeadActivity {
  return {
    type: entry.type ?? undefined,
    actorUserId: entry.actorUserId,
    actorName: entry.actorName,
    fromStatus: statusOf(entry.fromStatus),
    toStatus: statusOf(entry.toStatus),
    occurredAt: entry.occurredAt ?? undefined,
    referenceId: entry.referenceId,
    referenceNo: entry.referenceNo,
  };
}

/**
 * The page after a survey command answer (A-23): the lead's status and version from `lead`, the History row appended
 * once. A no-op answer (no History row, A-6) leaves the lead as it is. The survey block is replaced by the caller.
 */
export function applySurveyCommandResult(
  detail: LeadDetail,
  result: Pick<NonNullable<SurveyCommandResult>, "lead" | "historyEntry">,
): LeadDetail {
  const entry = result.historyEntry;
  if (entry === null || entry === undefined) return detail;
  const lead = result.lead;
  const merged: LeadDetail = {
    ...detail,
    status: lead?.status ?? detail.status,
    version: lead?.version ?? detail.version,
  };
  const activity = surveyActivity(entry);
  const history = merged.activities ?? [];
  const known = history.some(
    (row) => row.type === activity.type && row.occurredAt === activity.occurredAt && row.referenceId === activity.referenceId,
  );
  return known ? merged : { ...merged, activities: [...history, activity] };
}
