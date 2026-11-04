import { WORKSPACE_HOME } from "@/features/workspace";

import type { ChecklistReviewQueue, ChecklistReviewReason } from "../types";

// The "Reviews" tab of `/workspace/surveys` (survey-checklist submission spec 6.2, A-9, U-2). `canReview` and `reason` are
// hints for the viewer; the decision itself stays the judge.

export type ReviewRow = {
  checklistId: string;
  checklistNo: number | null;
  leadId: string;
  leadCode: string;
  submittedAt: string | null;
  submittedByName: string | null;
  canReview: boolean;
  reason: string | null;
};

/** The rows of a page in the order of the answer: oldest submission first. */
export function reviewRows(page: ChecklistReviewQueue): ReviewRow[] {
  return (page.items ?? []).flatMap((item) =>
    item.checklistId && item.leadId
      ? [
          {
            checklistId: item.checklistId,
            checklistNo: item.checklistNo ?? null,
            leadId: item.leadId,
            leadCode: item.leadCode ?? "",
            submittedAt: item.submittedAt ?? null,
            submittedByName: item.submittedBy?.name ?? null,
            canReview: item.canReview === true,
            reason: item.reason ?? null,
          },
        ]
      : [],
  );
}

/** The checklist page of a row: its Review tab for a viewer who can review. Only ids go in the URL. */
export function reviewHref(row: Pick<ReviewRow, "leadId" | "checklistId" | "canReview">): string {
  const path = `${WORKSPACE_HOME}/${encodeURIComponent(row.leadId)}/survey-checklists/${encodeURIComponent(row.checklistId)}`;
  return row.canReview ? `${path}?tab=review` : path;
}

const REASONS: readonly ChecklistReviewReason[] = [
  "NOT_REVIEWER_ROLE",
  "NOT_SUBMITTED",
  "LEAD_STATUS",
  "INTENT_CHANGED",
  "SERVING_DISABLED",
  "NOT_INDEPENDENT",
];

/** The `Surveys` message of a reason; a general one for a reason this UI does not know. */
export function reviewReasonKey(reason: string | null | undefined): `reviews.reason.${ChecklistReviewReason | "UNKNOWN"}` {
  const known = REASONS.find((entry) => entry === reason);
  return `reviews.reason.${known ?? "UNKNOWN"}`;
}
