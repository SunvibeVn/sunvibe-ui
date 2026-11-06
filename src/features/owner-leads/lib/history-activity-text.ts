import type { LeadActivity } from "../types";

import { activityLabelKey, checklistGroupLabelKey, type OwnerLeadsKey } from "./labels";

/** Translator of the `OwnerLeads` namespace, with the values of an ICU message. */
export type OwnerLeadsTranslate = (key: OwnerLeadsKey, values?: Record<string, string | number>) => string;

const PHOTO_CATEGORIES = new Set([
  "EXTERIOR_ACCESS",
  "MAIN_SPACE",
  "KITCHEN",
  "BATHROOM",
  "SHARED_KITCHEN",
  "SHARED_BATHROOM",
  "SHARED_AMENITY",
  "DETAIL",
]);

/** "Photo added: <category>" and "Photo removed: <category>", the category in words (survey-media A-10); null otherwise. */
function photoText(activity: Pick<LeadActivity, "type" | "referenceDetail">, t: OwnerLeadsTranslate): string | null {
  if (activity.type !== "CHECKLIST_MEDIA_ADDED" && activity.type !== "CHECKLIST_MEDIA_REMOVED") return null;
  const category = activity.referenceDetail ?? "";
  if (!PHOTO_CATEGORIES.has(category)) return null;
  const words = t(`checklist.media.categories.${category as "DETAIL"}`);
  return t(activity.type === "CHECKLIST_MEDIA_ADDED" ? "history.photoAdded" : "history.photoRemoved", { category: words });
}

const REVIEW_OUTCOMES = new Set(["PASSED", "NEEDS_CHANGES", "FAILED"]);

/** Rows that never show a note: their text stays on the revision (`survey BR-4`) or the intake (intake 4.12). */
const EVENT_ONLY = new Set<string>([
  "CHECKLIST_REVIEWED",
  "REQUALIFICATION_MARKED",
  "INVENTORY_INTAKE_COMPLETED",
  "INVENTORY_INTAKE_SUSPENDED",
  "INVENTORY_INTAKE_RESTORED",
]);

/** The checklist rows' own wording (survey-checklist spec 6.4): "Checklist #m started", "Checklist #m: <group> saved". */
function checklistText(
  activity: Pick<LeadActivity, "type" | "referenceNo" | "referenceDetail">,
  t: OwnerLeadsTranslate,
): string | null {
  const no = activity.referenceNo;
  if (typeof no !== "number") return null;
  if (activity.type === "CHECKLIST_STARTED") return t("history.checklistStarted", { no });
  if (activity.type === "CHECKLIST_TAKEN_OVER") return t("history.checklistTakenOver", { no });
  if (activity.type === "CHECKLIST_SUBMITTED") return t("history.checklistSubmitted", { no });
  if (activity.type === "CHECKLIST_REVISION_STARTED") return t("history.revisionStarted", { no });
  if (activity.type === "REQUALIFICATION_MARKED") return t("history.requalified", { no });
  if (activity.type === "INVENTORY_INTAKE_COMPLETED") return t("history.intakeCompleted", { no });
  if (activity.type === "INVENTORY_INTAKE_SUSPENDED") return t("history.intakeSuspended", { no });
  if (activity.type === "INVENTORY_INTAKE_RESTORED") return t("history.intakeRestored", { no });
  if (activity.type === "CHECKLIST_REVIEWED") {
    // `<OUTCOME>[:<KIND>]`: the row names the outcome only (survey-checklist 6.2).
    const outcome = (activity.referenceDetail ?? "").split(":")[0];
    if (!REVIEW_OUTCOMES.has(outcome)) return null;
    return t("history.checklistReviewed", { no, outcome: t(`checklist.review.outcome.${outcome as "PASSED"}`) });
  }
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
  // A review or requalification row says only the event, whatever else it carries (`survey BR-4`).
  const note = EVENT_ONLY.has(activity.type ?? "") ? "" : activity.note?.trim();
  if (note) return activity.note ?? "";
  const checklist = checklistText(activity, t) ?? photoText(activity, t);
  if (checklist !== null) return checklist;
  const label = t(activityLabelKey(activity.type));
  return typeof activity.referenceNo === "number" ? `${label} · #${activity.referenceNo}` : label;
}
