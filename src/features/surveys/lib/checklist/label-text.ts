import type { OwnerLeadsKey } from "@/features/lead-shared";

import type { ChecklistGroupName, ChecklistRequalificationKind } from "../../types";

/** The group names of survey-checklist spec 6.4, in the order G1..G8. */
export const CHECKLIST_GROUP_LABEL: Record<ChecklistGroupName, OwnerLeadsKey> = {
  IDENTIFICATION: "checklist.groups.IDENTIFICATION",
  PARTS: "checklist.groups.PARTS",
  DIMENSIONS: "checklist.groups.DIMENSIONS",
  CONDITION: "checklist.groups.CONDITION",
  SAFETY: "checklist.groups.SAFETY",
  AMENITIES: "checklist.groups.AMENITIES",
  EVIDENCE: "checklist.groups.EVIDENCE",
  TERMS: "checklist.groups.TERMS",
};

/** Label key of a group the API sent, or null for none or a group this UI does not know. */
export function checklistGroupLabelKey(group: string | null | undefined): OwnerLeadsKey | null {
  return typeof group === "string" && Object.hasOwn(CHECKLIST_GROUP_LABEL, group)
    ? CHECKLIST_GROUP_LABEL[group as ChecklistGroupName]
    : null;
}

/** What is wrong with a PASSED revision (property-create requalification A-5), in the order the dialog offers them. */
export const REQUALIFICATION_KIND_LABEL: Record<ChecklistRequalificationKind, OwnerLeadsKey> = {
  WRONG_ASSET: "checklist.requalification.kinds.WRONG_ASSET",
  WRONG_OWNER: "checklist.requalification.kinds.WRONG_OWNER",
  WRONG_PERSON: "checklist.requalification.kinds.WRONG_PERSON",
  WRONG_SCOPE: "checklist.requalification.kinds.WRONG_SCOPE",
  NEED_CHANGED: "checklist.requalification.kinds.NEED_CHANGED",
  PHOTO_PROBLEM: "checklist.requalification.kinds.PHOTO_PROBLEM",
  HAZARD: "checklist.requalification.kinds.HAZARD",
  OTHER: "checklist.requalification.kinds.OTHER",
};

/** Label key of a kind the API sent, or null for none or a kind this UI does not know. */
export function requalificationKindKey(kind: string | null | undefined): OwnerLeadsKey | null {
  return typeof kind === "string" && Object.hasOwn(REQUALIFICATION_KIND_LABEL, kind)
    ? REQUALIFICATION_KIND_LABEL[kind as ChecklistRequalificationKind]
    : null;
}
