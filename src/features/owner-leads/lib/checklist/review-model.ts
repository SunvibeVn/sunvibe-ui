import {
  type ChecklistDecisionInput,
  type ChecklistDecisionRule,
  type ChecklistFailedKind,
  type ChecklistNeedsChangesKind,
  type ChecklistOutcome,
  type ChecklistUiError,
  type ChecklistView,
  decisionRules,
} from "@/features/surveys";

import { cleanText, optionalText, requiredText, type SurveyProblem, type SurveyProblems } from "../../schemas/survey/survey-text";
import type { OwnerLeadsKey } from "../labels";

import type { MediaPanelModel, PhotoCard } from "./media-panel-model";

// The Review tab of the checklist page (survey-checklist submission spec 6.1, 4.5, U-2, U-3) as pure functions. The form
// lives in page memory only: no review text or photo mark goes to a draft, a URL or a log (`survey BR-4`, `survey BR-14`).

/** Reason, notes and limitations (A-10). */
export const REVIEW_TEXT_MAX = 2000;
/** The reason of a photo marked Not accepted (A-10). */
export const REJECTION_REASON_MAX = 500;

/** The reviewer's mark of one frozen photo; a reason stays typed when the mark is taken back. */
export type PhotoMark = { rejected: boolean; reason: string };

export type ReviewForm = {
  outcome: ChecklistOutcome | "";
  needsChangesKind: ChecklistNeedsChangesKind | "";
  failedKind: ChecklistFailedKind | "";
  reason: string;
  notes: string;
  limitations: string;
  /** By media id; a photo without an entry counts as accepted (A-5). */
  marks: Readonly<Record<string, PhotoMark>>;
};

export const EMPTY_REVIEW_FORM: ReviewForm = {
  outcome: "",
  needsChangesKind: "",
  failedKind: "",
  reason: "",
  notes: "",
  limitations: "",
  marks: {},
};

export type ReviewField = "outcome" | "kind" | "reason" | "notes" | "limitations";
export type ReviewProblems = { fields: SurveyProblems<ReviewField>; marks: Record<string, SurveyProblem> };

/** What a decision gave the tab; page-level outcomes (404, session) are handled already. */
export type DecisionResult =
  | { kind: "decided" }
  /** The read after a refusal shows a decision: this reviewer's, committed before its answer failed, or another's. */
  | { kind: "already-decided" }
  /** The answer and the read after it both failed: the decision may stand. */
  | { kind: "unknown"; error: ChecklistUiError }
  | { kind: "failed"; error: ChecklistUiError };

/** True when the form holds anything the reviewer chose or typed. */
export function hasReviewInput(form: ReviewForm): boolean {
  return (
    form.outcome !== "" ||
    cleanText(form.reason) !== "" ||
    cleanText(form.notes) !== "" ||
    cleanText(form.limitations) !== "" ||
    Object.values(form.marks).some((mark) => mark.rejected || cleanText(mark.reason) !== "")
  );
}

/**
 * The Review tab of a viewer: `open` on a SUBMITTED revision they can review (the hint is not the judge, the server is,
 * handoff 3); else hidden, unless they already typed: a refusal or a read may end their review while they work, and
 * what they typed stays in reach, `blocked`, read-only and with the reason (spec 6.1: a refused decision keeps the form).
 */
export function reviewAccess(view: ChecklistView, form: ReviewForm): "open" | "blocked" | "hidden" {
  if (view.status !== "SUBMITTED") return "hidden";
  if (view.review?.canReview === true) return "open";
  return hasReviewInput(form) ? "blocked" : "hidden";
}

/** The form as the page holds it: for one user and revision, in page memory only (`survey BR-4`). */
export type HeldReviewForm = { key: string; form: ReviewForm };

/** The held form after `update`. It starts from what is held now, so a late answer never puts a cleared form back. */
export function heldReviewForm(held: HeldReviewForm, key: string, update: (form: ReviewForm) => ReviewForm): HeldReviewForm {
  return { key, form: update(held.key === key ? held.form : EMPTY_REVIEW_FORM) };
}

function frozenIds(view: ChecklistView): string[] {
  return (view.submission?.evidence ?? []).flatMap((entry) => (entry.mediaId ? [entry.mediaId] : []));
}

/** The photos of the frozen set marked Not accepted, in the set's order. */
function rejectedIds(form: ReviewForm, view: ChecklistView): string[] {
  return frozenIds(view).filter((id) => Object.hasOwn(form.marks, id) && form.marks[id].rejected);
}

/**
 * The rules that keep PASSED disabled: what the read names (`decisionBlockedBy`), then the photos marked here (R3), which
 * the read cannot know before a decision is sent.
 */
export function passedBlockers(view: ChecklistView, form: ReviewForm): ChecklistDecisionRule[] {
  const rules = decisionRules(view.review?.decisionBlockedBy ?? []);
  return rejectedIds(form, view).length > 0 && !rules.includes("EVIDENCE_REJECTED") ? [...rules, "EVIDENCE_REJECTED"] : rules;
}

const firstProblem = (schema: ReturnType<typeof requiredText>, text: string): SurveyProblem | null => {
  const result = schema.safeParse(text);
  return result.success ? null : (result.error.issues[0].message as SurveyProblem);
};

const kindOf = (form: ReviewForm): string =>
  form.outcome === "NEEDS_CHANGES" ? form.needsChangesKind : form.outcome === "FAILED" ? form.failedKind : "";

/** What keeps the form from being sent (R1, A-10); the server stays the judge of every rule. */
export function reviewProblems(form: ReviewForm, view: ChecklistView): ReviewProblems {
  const fields: SurveyProblems<ReviewField> = {};
  const marks: Record<string, SurveyProblem> = {};
  const report = (field: ReviewField, problem: SurveyProblem | null) => {
    if (problem !== null) fields[field] = problem;
  };
  if (form.outcome === "") return { fields: { outcome: "required" }, marks };
  if (form.outcome === "PASSED") {
    if (passedBlockers(view, form).length > 0) fields.outcome = "notAllowed";
    report("limitations", firstProblem(optionalText(REVIEW_TEXT_MAX), form.limitations));
  } else {
    if (kindOf(form) === "") fields.kind = "required";
    report("reason", firstProblem(requiredText(REVIEW_TEXT_MAX), form.reason));
  }
  report("notes", firstProblem(optionalText(REVIEW_TEXT_MAX), form.notes));
  for (const id of rejectedIds(form, view)) {
    const problem = firstProblem(requiredText(REJECTION_REASON_MAX), form.marks[id].reason);
    if (problem !== null) marks[id] = problem;
  }
  return { fields, marks };
}

/** One frozen photo as the reviewer sees it: `view` opens it, `held` says why it has no image now. */
export type EvidenceRow = {
  mediaId: string;
  category: PhotoCard["category"];
  spaceCode: string | null;
  card: PhotoCard | null;
  state: "view" | "held" | "none";
};

/** The frozen set in its own order, each with its card of the list on screen; the list never adds or drops a photo. */
export function evidenceRows(view: ChecklistView, model: MediaPanelModel | null): EvidenceRow[] {
  const cards = model === null ? [] : [...model.groups.flatMap((group) => group.photos), ...model.notAccepted];
  return (view.submission?.evidence ?? []).flatMap((entry) => {
    if (!entry.mediaId) return [];
    const card = cards.find((photo) => photo.id === entry.mediaId) ?? null;
    const state = card?.canView ? "view" : card?.held ? "held" : "none";
    return [
      {
        mediaId: entry.mediaId,
        category: entry.category ?? "DETAIL",
        spaceCode: entry.spaceCode ?? null,
        card,
        state,
      },
    ];
  });
}

/** True when nothing keeps the form from being sent. */
export function isReviewValid(problems: ReviewProblems): boolean {
  return Object.keys(problems.fields).length === 0 && Object.keys(problems.marks).length === 0;
}

/**
 * The body of a decision: the optional keys only with their outcome and when filled, `rejectedEvidence` always, marks
 * only for frozen photos (R1). Text typed under another outcome stays in the form and is not sent.
 */
export function toDecisionInput(form: ReviewForm, view: ChecklistView): ChecklistDecisionInput {
  const input: ChecklistDecisionInput = {
    expectedVersion: view.version ?? 0,
    outcome: form.outcome === "" ? null : form.outcome,
    rejectedEvidence: rejectedIds(form, view).map((mediaId) => ({ mediaId, reason: cleanText(form.marks[mediaId].reason) })),
  };
  if (form.outcome === "NEEDS_CHANGES" && form.needsChangesKind !== "") input.needsChangesKind = form.needsChangesKind;
  if (form.outcome === "FAILED" && form.failedKind !== "") input.failedKind = form.failedKind;
  if (form.outcome === "NEEDS_CHANGES" || form.outcome === "FAILED") input.reason = cleanText(form.reason);
  if (cleanText(form.notes) !== "") input.notes = cleanText(form.notes);
  if (form.outcome === "PASSED" && cleanText(form.limitations) !== "") input.limitations = cleanText(form.limitations);
  return input;
}

/** The form with the mark of one photo set. */
export function withMark(form: ReviewForm, mediaId: string, mark: PhotoMark): ReviewForm {
  return { ...form, marks: { ...form.marks, [mediaId]: mark } };
}

/** The text of a rule that refuses a decision or keeps PASSED disabled. */
export function ruleTextKey(rule: ChecklistDecisionRule): OwnerLeadsKey {
  return `checklist.review.rule.${rule}`;
}

/** What the tab says about a refused decision; the texts the page shows itself are not listed here. */
export function decisionFailureTexts(error: ChecklistUiError): OwnerLeadsKey[] {
  switch (error.kind) {
    case "decision-not-allowed": {
      const rules = (error.rules ?? []).map(ruleTextKey);
      return rules.length > 0 ? rules : ["checklist.review.errors.notAllowed"];
    }
    case "review-not-allowed":
    case "forbidden":
      return ["checklist.review.errors.notReviewer"];
    case "stale":
      return ["checklist.review.errors.stale"];
    case "validation":
    case "form":
      return ["checklist.errors.badRequest"];
    default:
      return ["checklist.review.errors.failed"];
  }
}

/** Where the decision takes the lead, for the confirm step (spec 4.5). */
export function decisionConsequenceKey(form: ReviewForm): OwnerLeadsKey {
  if (form.outcome === "PASSED") return "checklist.review.confirm.consequence.qualified";
  if (form.outcome === "NEEDS_CHANGES" && form.needsChangesKind === "DOCUMENTS_ONLY") {
    return "checklist.review.confirm.consequence.revision";
  }
  if (form.outcome === "FAILED" && form.failedKind !== "TEMPORARY") return "checklist.review.confirm.consequence.closed";
  return "checklist.review.confirm.consequence.contacted";
}

/** How far the Review tab follows the chain of revisions. */
export const CHAIN_MAX = 20;

export type RevisionChain = {
  /** Newest first. */
  revisions: ChecklistView[];
  /** False when a read failed or the chain goes on beyond `max`: what was read is still shown. */
  complete: boolean;
};

/** Reads the revisions from `firstId` back along `previousChecklistId` (spec 6.1); `read` answers null on a failure. */
export async function loadChain(
  firstId: string | null | undefined,
  read: (checklistId: string) => Promise<ChecklistView | null>,
  options: { max?: number; stopped?: () => boolean } = {},
): Promise<RevisionChain> {
  const { max = CHAIN_MAX, stopped = () => false } = options;
  const revisions: ChecklistView[] = [];
  const seen = new Set<string>();
  let next = firstId ?? null;
  while (next !== null && !seen.has(next)) {
    // Each read writes the access log (spec 4.9): no read for a screen that is gone.
    if (revisions.length >= max || stopped()) return { revisions, complete: false };
    seen.add(next);
    const revision = await read(next);
    if (revision === null) return { revisions, complete: false };
    revisions.push(revision);
    next = revision.previousChecklistId ?? null;
  }
  return { revisions, complete: true };
}

/** A refused decision keeps every input (spec 6.1); once a decision stands the form is emptied. */
export function afterDecision(form: ReviewForm, result: DecisionResult): ReviewForm {
  return result.kind === "failed" || result.kind === "unknown" ? form : EMPTY_REVIEW_FORM;
}

/**
 * The decision commits before its answer is built (spec 9.5): after a 5xx, a lost answer or a 409 the page reads the
 * checklist before it shows an error.
 */
export function mayHaveCommitted(error: ChecklistUiError): boolean {
  return error.kind === "retry" || error.kind === "stale" || error.kind === "decision-not-allowed";
}
