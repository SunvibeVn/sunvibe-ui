import type { LeadActivity } from "../types";

/**
 * The STATUS of a history entry: the status it moved the lead to, or undefined for an entry that changed none (a note,
 * an assignment). The API sends `"toStatus": null` there rather than leaving the field out.
 */
export function historyStatus(activity: LeadActivity): NonNullable<LeadActivity["toStatus"]> | undefined {
  return activity.toStatus ?? undefined;
}
