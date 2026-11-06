import type { OwnerLeadsTranslate } from "@/features/lead-shared";
import type { ChecklistDecision, ChecklistOutcome, ChecklistView } from "@/features/surveys";
import { formatDate, formatDateTime } from "@/lib/format/vietnam-time";

import { requalificationKindKey } from "./label-text";
import { photoPair } from "./preview-model";

// The status banner and the decision panel of a revision (survey-checklist submission spec 6.1) as pure functions. The
// banner is the one place above the tabs that every viewer reads: it names who and when, never the review text.

export type StatusBanner = { tone: "info" | "success"; text: string };

export type DecisionMark = { mediaId: string; photo: string; reason: string };

/** Why a pass stopped being used. Only on the revision: never in History, lists, titles or URLs (`survey BR-4`). */
export type RequalificationModel = {
  kind: string;
  reason: string;
  source: string;
  scope: string;
  basisDate: string;
  markedBy: string;
  markedAt: string;
};

export type DecisionPanelModel = {
  outcome: string;
  reviewer: string;
  when: string;
  reason: string | null;
  notes: string | null;
  limitations: string | null;
  /** The frozen photos the reviewer did not accept. */
  marks: DecisionMark[];
  /** On a pass: what it is not (US-3 AC-3, D3-1) and, when it stopped being usable, why. */
  passedNotes: string[];
  /** On a pass withdrawn from use; the decision above it stays as it was (I-2). */
  requalification: RequalificationModel | null;
};

const person = (name: string | null | undefined, t: OwnerLeadsTranslate): string => name?.trim() || t("survey.unknownPerson");
const when = (instant: string | null | undefined): string => (instant ? formatDateTime(instant) : "");
const filled = (text: string | null | undefined): string | null => (text?.trim() ? text : null);

/** What tells two photos apart: their number and, for a carried one, its revision (numbers restart in each revision). */
export type PhotoRef = { mediaNo?: number | null; carriedFromChecklistNo?: number | null };

/** "Photo #4 · Space P1 · Kitchen"; the pair alone for a photo the list on screen does not hold. */
export function photoTitle(ref: PhotoRef | null, pair: string, t: OwnerLeadsTranslate): string {
  const no = ref?.mediaNo;
  if (no === null || no === undefined) return pair;
  const from = ref?.carriedFromChecklistNo;
  return from === null || from === undefined
    ? t("checklist.decision.photoNo", { no, pair })
    : t("checklist.decision.photoNoFrom", { no, from, pair });
}

/** The outcome of a decision; a decision that names none takes it from the status, never a default of Passed. */
function outcomeOf(view: ChecklistView, decision: ChecklistDecision): ChecklistOutcome | null {
  if (decision.outcome) return decision.outcome;
  return view.status === "PASSED" || view.status === "NEEDS_CHANGES" || view.status === "FAILED" ? view.status : null;
}

/** "Passed", "Needs changes (documents)", "Failed (out of scope)". */
function outcomeText(view: ChecklistView, decision: ChecklistDecision, t: OwnerLeadsTranslate): string {
  const known = outcomeOf(view, decision);
  if (known === null) return t("checklist.review.outcomeUnknown");
  const outcome = t(`checklist.review.outcome.${known}`);
  const kind = decision.needsChangesKind ?? decision.failedKind;
  return kind ? t("checklist.review.outcomeKind", { outcome, kind: t(`checklist.review.kind.${kind}`) }) : outcome;
}

/** Null on a draft. */
export function statusBanner(view: ChecklistView, t: OwnerLeadsTranslate): StatusBanner | null {
  if (view.status === "SUBMITTED") {
    const name = person(view.submission?.submittedBy?.name, t);
    return { tone: "info", text: t("checklist.banner.submitted", { name, when: when(view.submission?.submittedAt) }) };
  }
  const mark = view.requalification;
  if (mark) {
    return { tone: "info", text: t("checklist.banner.requalified", { name: person(mark.markedBy?.name, t), when: when(mark.markedAt) }) };
  }
  const decision = view.decision;
  if (!decision) return null;
  return {
    tone: outcomeOf(view, decision) === "PASSED" ? "success" : "info",
    text: t("checklist.banner.decided", {
      outcome: outcomeText(view, decision, t),
      name: person(decision.reviewer?.name, t),
      when: when(decision.decidedAt),
    }),
  };
}

function requalificationModel(view: ChecklistView, t: OwnerLeadsTranslate): RequalificationModel | null {
  const mark = view.requalification;
  if (!mark) return null;
  return {
    kind: t(requalificationKindKey(mark.reasonKind) ?? "checklist.requalification.kinds.OTHER"),
    reason: mark.reason ?? "",
    source: mark.eventSource ?? "",
    scope: mark.scope ?? "",
    basisDate: mark.basisDate ? formatDate(mark.basisDate) : "",
    markedBy: person(mark.markedBy?.name, t),
    markedAt: when(mark.markedAt),
  };
}

/**
 * Null before a decision. `photoOf` numbers the marks from the list on screen, so one of two photos of a pair can be
 * told apart; a photo the list does not hold (left this revision) keeps its pair.
 */
export function decisionPanelModel(
  view: ChecklistView,
  t: OwnerLeadsTranslate,
  photoOf: (mediaId: string) => PhotoRef | null = () => null,
): DecisionPanelModel | null {
  const decision = view.decision;
  if (!decision) return null;
  const marks = (view.submission?.evidence ?? []).flatMap((entry) => {
    if (entry.accepted !== false || !entry.mediaId) return [];
    const pair = photoPair(entry.spaceCode ?? null, entry.category ?? null, t);
    return [{ mediaId: entry.mediaId, photo: photoTitle(photoOf(entry.mediaId), pair, t), reason: entry.rejectionReason ?? "" }];
  });
  const passedNotes: string[] = [];
  if (outcomeOf(view, decision) === "PASSED") {
    passedNotes.push(t("checklist.decision.passedScope"));
    const reason = view.passed?.reason;
    if (view.passed?.usable === false && reason) passedNotes.push(t(`checklist.decision.passedReason.${reason}`));
  }
  return {
    outcome: outcomeText(view, decision, t),
    reviewer: person(decision.reviewer?.name, t),
    when: when(decision.decidedAt),
    reason: filled(decision.reason),
    notes: filled(decision.notes),
    limitations: filled(decision.limitations),
    marks,
    passedNotes,
    requalification: requalificationModel(view, t),
  };
}
