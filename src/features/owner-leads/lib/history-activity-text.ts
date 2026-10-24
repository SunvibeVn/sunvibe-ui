import type { LeadActivity } from "../types";

import { activityLabelKey, checklistGroupLabelKey, type OwnerLeadsKey } from "./labels";

/** Translator of the `OwnerLeads` namespace, with the values of an ICU message. */
export type OwnerLeadsTranslate = (key: OwnerLeadsKey, values?: Record<string, string | number>) => string;

/** The checklist rows' own wording (survey-checklist spec 6.4): "Checklist #m started", "Checklist #m: <group> saved". */
function checklistText(
  activity: Pick<LeadActivity, "type" | "referenceNo" | "referenceDetail">,
  t: OwnerLeadsTranslate,
): string | null {
  const no = activity.referenceNo;
  if (typeof no !== "number") return null;
  if (activity.type === "CHECKLIST_STARTED") return t("history.checklistStarted", { no });
  if (activity.type === "CHECKLIST_TAKEN_OVER") return t("history.checklistTakenOver", { no });
  if (activity.type === "CHECKLIST_SAVED") {
    const group = checklistGroupLabelKey(activity.referenceDetail);
    return group === null ? null : t("history.checklistSaved", { no, group: t(group) });
  }
  return null;
}

/**
 * The ACTIVITY text of a history row: its note when it has one, else its label, followed by " · #n" when the row
 * concerns a survey appointment (survey-schedule A-12: survey rows carry the appointment number, never text). A
 * checklist row names its checklist and, for a save, the group (survey-checklist A-13).
 */
export function historyActivityText(
  activity: Pick<LeadActivity, "type" | "note" | "referenceNo" | "referenceDetail">,
  t: OwnerLeadsTranslate,
): string {
  const note = activity.note?.trim();
  if (note) return activity.note ?? "";
  const checklist = checklistText(activity, t);
  if (checklist !== null) return checklist;
  const label = t(activityLabelKey(activity.type));
  return typeof activity.referenceNo === "number" ? `${label} · #${activity.referenceNo}` : label;
}
