import type { LeadActivity } from "../types";

import { activityLabelKey, type OwnerLeadsKey } from "./labels";

/**
 * The ACTIVITY text of a history row: its note when it has one, else its label, followed by " · #n" when the row
 * concerns a survey appointment (survey-schedule A-12: survey rows carry the appointment number, never text).
 */
export function historyActivityText(
  activity: Pick<LeadActivity, "type" | "note" | "referenceNo">,
  t: (key: OwnerLeadsKey) => string,
): string {
  const note = activity.note?.trim();
  if (note) return activity.note ?? "";
  const label = t(activityLabelKey(activity.type));
  return typeof activity.referenceNo === "number" ? `${label} · #${activity.referenceNo}` : label;
}
