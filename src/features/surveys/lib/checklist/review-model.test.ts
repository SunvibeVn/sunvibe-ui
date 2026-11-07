import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import type { ChecklistView } from "../../types";
import { emptyContent, viewOf } from "./fixtures.test-support";
import type { MediaPanelModel, PhotoCard } from "./media-panel-model";
import {
  afterDecision,
  decisionConsequenceKey,
  decisionFailureTexts,
  EMPTY_REVIEW_FORM,
  evidenceRows,
  hasReviewInput,
  heldReviewForm,
  loadChain,
  mayHaveCommitted,
  passedBlockers,
  type ReviewForm,
  reviewAccess,
  reviewProblems,
  ruleTextKey,
  toDecisionInput,
  withMark,
} from "./review-model";
import { checklistHref, tabOf } from "./routes";

const t = createTranslator({ locale: "en", messages: en, namespace: "OwnerLeads" });

const evidence = (mediaId: string) => ({ mediaId, category: "KITCHEN" as const, fullSha256: "a".repeat(64) });

const submitted = (review: object = {}, ids: readonly string[] = ["M1", "M2"]) =>
  viewOf(emptyContent(), 1, {
    status: "SUBMITTED",
    editable: false,
    readOnlyReason: "SUBMITTED",
    version: 4,
    review: { canReview: true, reason: null, decisionBlockedBy: [], ...review },
    submission: { submittedAt: "2026-11-04T03:00:00Z", mediaPolicy: "MEDIA_V1_NO_PERMISSION", evidence: ids.map(evidence) },
  });

const form = (overrides: Partial<ReviewForm>): ReviewForm => ({ ...EMPTY_REVIEW_FORM, ...overrides });

describe("reviewAccess (spec 6.1, U-2)", () => {
  const empty = EMPTY_REVIEW_FORM;
  const typed = form({ reason: "Bring the land paper" });

  it("opens the tab on a SUBMITTED revision the viewer can review", () => {
    expect(reviewAccess(submitted(), empty)).toBe("open");
  });

  it("reviewModel_hiddenWhenCannotReview", () => {
    expect(reviewAccess(submitted({ canReview: false, reason: "NOT_INDEPENDENT" }), empty)).toBe("hidden");
    expect(reviewAccess(viewOf(emptyContent(), 1, { status: "SUBMITTED" }), empty)).toBe("hidden");
  });

  it("is hidden on a revision that is not SUBMITTED, whatever the hint or the form says", () => {
    expect(reviewAccess(viewOf(emptyContent(), 1, { review: { canReview: true } }), empty)).toBe("hidden");
    expect(reviewAccess(viewOf(emptyContent(), 1, { status: "PASSED", review: { canReview: true } }), typed)).toBe("hidden");
  });

  it("I-1: keeps what was typed in reach when the viewer can no longer review, without sending", () => {
    expect(reviewAccess(submitted({ canReview: false, reason: "LEAD_STATUS" }), typed)).toBe("blocked");
  });
});

describe("hasReviewInput", () => {
  it("is false for the empty form and for marks without content", () => {
    expect(hasReviewInput(EMPTY_REVIEW_FORM)).toBe(false);
    expect(hasReviewInput(withMark(EMPTY_REVIEW_FORM, "M1", { rejected: false, reason: "  " }))).toBe(false);
  });

  it("is true for an outcome, a text or a mark", () => {
    expect(hasReviewInput(form({ outcome: "PASSED" }))).toBe(true);
    expect(hasReviewInput(form({ notes: "x" }))).toBe(true);
    expect(hasReviewInput(form({ limitations: "x" }))).toBe(true);
    expect(hasReviewInput(withMark(EMPTY_REVIEW_FORM, "M1", { rejected: true, reason: "" }))).toBe(true);
    expect(hasReviewInput(withMark(EMPTY_REVIEW_FORM, "M1", { rejected: false, reason: "typed" }))).toBe(true);
  });
});

describe("heldReviewForm (survey BR-4: the form is cleared with the route and belongs to one user and revision)", () => {
  const typed = form({ reason: "Bring the land paper" });
  const key = "U1:C1";

  it("updates the form held for this key", () => {
    expect(heldReviewForm({ key, form: typed }, key, (current) => ({ ...current, notes: "x" }))).toEqual({
      key,
      form: { ...typed, notes: "x" },
    });
  });

  it("starts empty for another user or revision", () => {
    expect(heldReviewForm({ key: "U9:C1", form: typed }, key, (current) => current)).toEqual({ key, form: EMPTY_REVIEW_FORM });
  });

  it("a late refusal cannot put back a form cleared meanwhile", () => {
    const cleared = { key, form: EMPTY_REVIEW_FORM };
    const failure = { kind: "failed", error: { kind: "retry" } } as const;
    expect(heldReviewForm(cleared, key, (current) => afterDecision(current, failure)).form).toEqual(EMPTY_REVIEW_FORM);
  });
});

describe("passedBlockers (spec 4.5, U-3)", () => {
  it("reviewModel_passedDisabledWithServerReasons: the rules the read names, in its order", () => {
    const view = submitted({ decisionBlockedBy: ["hazards", "evidence.unavailable", "appointment", "evidence.coverage"] });
    expect(passedBlockers(view, EMPTY_REVIEW_FORM)).toEqual(["HAZARDS", "EVIDENCE_UNAVAILABLE", "APPOINTMENT", "EVIDENCE_COVERAGE"]);
  });

  it("adds the photo marked here (R3): the read cannot know a mark that was not sent", () => {
    const marked = withMark(EMPTY_REVIEW_FORM, "M1", { rejected: true, reason: "Blurred" });
    expect(passedBlockers(submitted(), marked)).toEqual(["EVIDENCE_REJECTED"]);
    expect(passedBlockers(submitted({ decisionBlockedBy: ["hazards"] }), marked)).toEqual(["HAZARDS", "EVIDENCE_REJECTED"]);
  });

  it("is empty when nothing blocks; a mark taken back blocks nothing", () => {
    expect(passedBlockers(submitted(), EMPTY_REVIEW_FORM)).toEqual([]);
    const cleared = withMark(EMPTY_REVIEW_FORM, "M1", { rejected: false, reason: "Blurred" });
    expect(passedBlockers(submitted(), cleared)).toEqual([]);
  });

  it("does not count a mark on a photo outside the frozen set", () => {
    expect(passedBlockers(submitted(), withMark(EMPTY_REVIEW_FORM, "OTHER", { rejected: true, reason: "x" }))).toEqual([]);
  });
});

describe("reviewProblems (spec 4.5 R1, A-10)", () => {
  it("asks for an outcome first", () => {
    expect(reviewProblems(EMPTY_REVIEW_FORM, submitted()).fields).toEqual({ outcome: "required" });
  });

  it("accepts PASSED alone; notes and limitations are optional", () => {
    expect(reviewProblems(form({ outcome: "PASSED" }), submitted())).toEqual({ fields: {}, marks: {} });
    expect(reviewProblems(form({ outcome: "PASSED", notes: "Fine", limitations: "Roof not seen" }), submitted()).fields).toEqual({});
  });

  it("refuses PASSED while a rule blocks it", () => {
    const view = submitted({ decisionBlockedBy: ["hazards"] });
    expect(reviewProblems(form({ outcome: "PASSED" }), view).fields).toEqual({ outcome: "notAllowed" });
  });

  it("reviewModel_needsChangesRequiresKindAndReason", () => {
    expect(reviewProblems(form({ outcome: "NEEDS_CHANGES" }), submitted()).fields).toEqual({ kind: "required", reason: "required" });
    expect(
      reviewProblems(form({ outcome: "NEEDS_CHANGES", needsChangesKind: "DOCUMENTS_ONLY", reason: "   " }), submitted()).fields,
    ).toEqual({ reason: "required" });
    expect(
      reviewProblems(form({ outcome: "NEEDS_CHANGES", needsChangesKind: "RESURVEY_REQUIRED", reason: "See again" }), submitted()).fields,
    ).toEqual({});
  });

  it("reviewModel_failedRequiresKindAndReason", () => {
    expect(reviewProblems(form({ outcome: "FAILED" }), submitted()).fields).toEqual({ kind: "required", reason: "required" });
    expect(reviewProblems(form({ outcome: "FAILED", failedKind: "OUT_OF_SCOPE", reason: "Not a rental" }), submitted()).fields).toEqual({});
  });

  it("does not take the kind of the other outcome", () => {
    expect(
      reviewProblems(form({ outcome: "FAILED", needsChangesKind: "DOCUMENTS_ONLY", reason: "x" }), submitted()).fields,
    ).toEqual({ kind: "required" });
  });

  it("holds the texts to 2000 characters without a phone number", () => {
    const long = "x".repeat(2001);
    expect(
      reviewProblems(form({ outcome: "NEEDS_CHANGES", needsChangesKind: "DOCUMENTS_ONLY", reason: long, notes: long }), submitted()).fields,
    ).toEqual({ reason: "tooLong", notes: "tooLong" });
    expect(reviewProblems(form({ outcome: "PASSED", limitations: long }), submitted()).fields).toEqual({ limitations: "tooLong" });
    expect(
      reviewProblems(form({ outcome: "FAILED", failedKind: "TEMPORARY", reason: "Call 0912 345 678" }), submitted()).fields,
    ).toEqual({ reason: "phone" });
    expect(reviewProblems(form({ outcome: "PASSED", notes: "Owner 0912345678" }), submitted()).fields).toEqual({ notes: "phone" });
  });

  it("checks limitations only with PASSED: another outcome never sends them", () => {
    const text = "x".repeat(2001);
    expect(
      reviewProblems(form({ outcome: "FAILED", failedKind: "TEMPORARY", reason: "Later", limitations: text }), submitted()).fields,
    ).toEqual({});
  });

  it("asks a reason of 1..500 for each photo marked Not accepted", () => {
    const base = form({ outcome: "NEEDS_CHANGES", needsChangesKind: "DOCUMENTS_ONLY", reason: "x" });
    expect(reviewProblems(withMark(base, "M1", { rejected: true, reason: " " }), submitted()).marks).toEqual({ M1: "required" });
    expect(reviewProblems(withMark(base, "M1", { rejected: true, reason: "x".repeat(501) }), submitted()).marks).toEqual({ M1: "tooLong" });
    expect(reviewProblems(withMark(base, "M1", { rejected: true, reason: "Call 0912345678" }), submitted()).marks).toEqual({ M1: "phone" });
    expect(reviewProblems(withMark(base, "M1", { rejected: false, reason: " " }), submitted()).marks).toEqual({});
  });
});

describe("toDecisionInput (spec 7.1, handoff 2)", () => {
  it("sends the version read, the kind of the outcome, the cleaned texts and the marks", () => {
    const marked = withMark(
      form({
        outcome: "NEEDS_CHANGES",
        needsChangesKind: "DOCUMENTS_ONLY",
        failedKind: "TEMPORARY",
        reason: "  Bring the land paper ",
        notes: " Keep the kitchen photos ",
        limitations: "typed before the outcome changed",
      }),
      "M1",
      { rejected: true, reason: " Blurred " },
    );
    expect(toDecisionInput(marked, submitted())).toEqual({
      expectedVersion: 4,
      outcome: "NEEDS_CHANGES",
      needsChangesKind: "DOCUMENTS_ONLY",
      reason: "Bring the land paper",
      notes: "Keep the kitchen photos",
      rejectedEvidence: [{ mediaId: "M1", reason: "Blurred" }],
    });
  });

  it("leaves out empty optional keys; `rejectedEvidence` is always sent", () => {
    expect(toDecisionInput(form({ outcome: "PASSED", reason: "typed earlier" }), submitted())).toEqual({
      expectedVersion: 4,
      outcome: "PASSED",
      rejectedEvidence: [],
    });
  });

  it("sends limitations only with PASSED", () => {
    expect(toDecisionInput(form({ outcome: "PASSED", limitations: " Roof not seen " }), submitted()).limitations).toBe("Roof not seen");
  });

  it("sends the failed kind with FAILED", () => {
    expect(toDecisionInput(form({ outcome: "FAILED", failedKind: "OUT_OF_SCOPE", reason: "No" }), submitted())).toEqual({
      expectedVersion: 4,
      outcome: "FAILED",
      failedKind: "OUT_OF_SCOPE",
      reason: "No",
      rejectedEvidence: [],
    });
  });

  it("sends marks only for frozen photos, each once", () => {
    const marked = withMark(
      withMark(form({ outcome: "FAILED", failedKind: "TEMPORARY", reason: "x" }), "M2", { rejected: true, reason: "Dark" }),
      "OTHER",
      { rejected: true, reason: "Not in the set" },
    );
    expect(toDecisionInput(marked, submitted()).rejectedEvidence).toEqual([{ mediaId: "M2", reason: "Dark" }]);
  });

  it("drops a mark taken back", () => {
    const marked = withMark(form({ outcome: "PASSED" }), "M2", { rejected: false, reason: "Dark" });
    expect(toDecisionInput(marked, submitted()).rejectedEvidence).toEqual([]);
  });
});

describe("after a decision (spec 6.1, 9.5, Review Focus 2)", () => {
  it("reviewForm_refusedDecision_keepsInputs", () => {
    const typed = withMark(form({ outcome: "PASSED", notes: "Fine" }), "M1", { rejected: true, reason: "Blurred" });
    expect(afterDecision(typed, { kind: "failed", error: { kind: "decision-not-allowed", rules: ["EVIDENCE_UNAVAILABLE"] } })).toBe(typed);
    expect(afterDecision(typed, { kind: "failed", error: { kind: "retry" } })).toBe(typed);
    expect(afterDecision(typed, { kind: "unknown", error: { kind: "retry" } })).toBe(typed);
  });

  it("empties the form once a decision stands, the reviewer's or another's", () => {
    const typed = form({ outcome: "PASSED", notes: "Fine" });
    expect(afterDecision(typed, { kind: "decided" })).toEqual(EMPTY_REVIEW_FORM);
    expect(afterDecision(typed, { kind: "already-decided" })).toEqual(EMPTY_REVIEW_FORM);
  });

  it("reads again before an error when the decision may have committed (5xx, network, 409)", () => {
    for (const kind of ["retry", "stale", "decision-not-allowed"] as const) expect(mayHaveCommitted({ kind })).toBe(true);
    for (const kind of ["forbidden", "review-not-allowed", "not-found", "validation", "signed-out"] as const) {
      expect(mayHaveCommitted({ kind })).toBe(false);
    }
  });
});

describe("the texts of a refused decision (spec 7.3, 6.3)", () => {
  it("names each rule that refused", () => {
    expect(decisionFailureTexts({ kind: "decision-not-allowed", rules: ["HAZARDS", "EVIDENCE_UNAVAILABLE"] }).map((key) => t(key))).toEqual([
      "A risk warning is still open.",
      "A frozen photo is held or has lost its content.",
    ]);
  });

  it("has a text for every rule", () => {
    const rules = {
      STATUS: "This revision is no longer waiting for a decision.",
      LEAD_STATUS: "The lead is not in Survey Scheduled.",
      LEAD_INTENT_CYCLE: "The requirement changed after this visit.",
      VISIT: "A newer site visit exists.",
      MEDIA_SERVING: "Photo viewing is off, so no decision can be made now.",
      HAZARDS: "A risk warning is still open.",
      EVIDENCE_REJECTED: "A photo is marked Not accepted.",
      EVIDENCE_UNAVAILABLE: "A frozen photo is held or has lost its content.",
      APPOINTMENT: "A survey is still scheduled on this lead.",
      EVIDENCE_COVERAGE: "A required photo pair is not covered by an accepted photo.",
    } as const;
    for (const [rule, text] of Object.entries(rules)) expect(t(ruleTextKey(rule as keyof typeof rules))).toBe(text);
  });

  it("falls back to one text when the refusal names no rule this UI knows", () => {
    expect(decisionFailureTexts({ kind: "decision-not-allowed", rules: [] }).map((key) => t(key))).toEqual([
      "This decision is not allowed now.",
    ]);
  });

  it("says the viewer cannot review after a 403 of the reviewer rule", () => {
    expect(decisionFailureTexts({ kind: "review-not-allowed" }).map((key) => t(key))).toEqual([
      "You cannot review this revision: you took part in it, you hold the lead, or your account cannot sign in.",
    ]);
  });

  it("says the same after a plain 403 on a decision", () => {
    expect(decisionFailureTexts({ kind: "forbidden" })).toEqual(decisionFailureTexts({ kind: "review-not-allowed" }));
  });

  it("says when the answer and the read were both lost: sending again is safe and keeps the form", () => {
    expect(t("checklist.review.errors.unknown")).toBe(
      "The answer was lost and the checklist could not be read. The decision may stand. Send it again: a second decision is refused, nothing changes.",
    );
  });

  it("says what to do after a conflict, a bad body or a failure", () => {
    expect(t(decisionFailureTexts({ kind: "stale" })[0])).toBe("The revision changed meanwhile. It has been reloaded; check it and send again.");
    expect(t(decisionFailureTexts({ kind: "validation", fieldErrors: {} })[0])).toBe("Some details are not valid. Please check them.");
    expect(t(decisionFailureTexts({ kind: "retry" })[0])).toBe("The decision could not be sent. Please try again.");
  });
});

describe("decisionConsequenceKey (the confirm step: a decision cannot be changed)", () => {
  const text = (overrides: Partial<ReviewForm>) => t(decisionConsequenceKey(form(overrides)));

  it("says where each outcome takes the lead", () => {
    expect(text({ outcome: "PASSED" })).toBe("The lead moves to Qualified.");
    expect(text({ outcome: "NEEDS_CHANGES", needsChangesKind: "DOCUMENTS_ONLY" })).toBe(
      "The lead stays in Survey Scheduled and the assignee can start a new revision on this visit.",
    );
    expect(text({ outcome: "NEEDS_CHANGES", needsChangesKind: "RESURVEY_REQUIRED" })).toBe(
      "The lead returns to Contacted and needs a new visit.",
    );
    expect(text({ outcome: "FAILED", failedKind: "TEMPORARY" })).toBe("The lead returns to Contacted and needs a new visit.");
  });

  it("warns that a failure out of scope or not accepted closes the lead for good", () => {
    for (const failedKind of ["OUT_OF_SCOPE", "NOT_ACCEPTED"] as const) {
      expect(text({ outcome: "FAILED", failedKind })).toBe("The lead closes as Declined. A closed lead cannot be reopened.");
    }
  });
});

describe("the media v1 banner (spec 6.1, D3-1, SV-075)", () => {
  it("says photo permission was not recorded and the photos stay internal", () => {
    expect(t("checklist.review.mediaBanner")).toBe(
      "Media v1: photo permission was not recorded. These photos are internal survey evidence, not approved for any other use.",
    );
  });
});

describe("evidenceRows (spec 6.1: the frozen photos, never the list of the moment)", () => {
  const card = (id: string, overrides: Partial<PhotoCard> = {}): PhotoCard => ({
    id,
    mediaNo: 3,
    category: "KITCHEN",
    spaceId: null,
    badge: "ready",
    statusReason: null,
    caption: null,
    uploadedAs: null,
    uploadedByName: null,
    carriedFromChecklistNo: null,
    held: null,
    showImage: true,
    canView: true,
    canRemove: false,
    canHold: false,
    canRelease: false,
    ...overrides,
  });
  const model = (photos: PhotoCard[]) =>
    ({ groups: [{ spaceId: null, spaceCode: null, category: "KITCHEN", photos }], notAccepted: [] }) as unknown as MediaPanelModel;

  it("keeps the frozen set and its order, whatever else the list holds", () => {
    const rows = evidenceRows(submitted({}, ["M2", "M1"]), model([card("M1"), card("M2"), card("OTHER")]));
    expect(rows.map((row) => row.mediaId)).toEqual(["M2", "M1"]);
    expect(rows[0]).toMatchObject({ category: "KITCHEN", spaceCode: null, state: "view" });
  });

  it("says a frozen photo is held, and that one without a card has no image", () => {
    const held = card("M1", { canView: false, showImage: false, held: { at: "2026-11-04T03:00:00Z", byName: null, reason: null } });
    expect(evidenceRows(submitted({}, ["M1", "M2"]), model([held])).map((row) => row.state)).toEqual(["held", "none"]);
    expect(evidenceRows(submitted({}, ["M1"]), null).map((row) => row.state)).toEqual(["none"]);
  });
});

describe("loadChain (spec 6.1: the earlier decisions of the chain)", () => {
  const revision = (id: string, previousChecklistId: string | null, overrides: Partial<ChecklistView> = {}) =>
    viewOf(emptyContent(), 1, { id, previousChecklistId, ...overrides });

  it("walks back along previousChecklistId, newest first", async () => {
    const reads: string[] = [];
    const store: Record<string, ChecklistView> = { C2: revision("C2", "C1"), C1: revision("C1", null) };
    const result = await loadChain("C2", async (id) => {
      reads.push(id);
      return store[id] ?? null;
    });
    expect(reads).toEqual(["C2", "C1"]);
    expect(result).toEqual({ revisions: [store.C2, store.C1], complete: true });
  });

  it("is empty and complete without an earlier revision", async () => {
    expect(await loadChain(null, async () => null)).toEqual({ revisions: [], complete: true });
  });

  it("keeps what it read when a read fails", async () => {
    const first = revision("C2", "C1");
    expect(await loadChain("C2", async (id) => (id === "C2" ? first : null))).toEqual({ revisions: [first], complete: false });
  });

  it("never reads a revision twice, even if the links go round", async () => {
    let reads = 0;
    const result = await loadChain("C2", async (id) => {
      reads += 1;
      return revision(id, id === "C2" ? "C1" : "C2");
    });
    expect(reads).toBe(2);
    expect(result.complete).toBe(true);
  });

  it("stops reading once its screen is gone: each read writes the access log (spec 4.9)", async () => {
    let reads = 0;
    let gone = false;
    const result = await loadChain(
      "C0",
      async (id) => {
        reads += 1;
        gone = true;
        return revision(id, "C1");
      },
      { stopped: () => gone },
    );
    expect(reads).toBe(1);
    expect(result.complete).toBe(false);
  });

  it("stops after the most revisions it reads", async () => {
    let reads = 0;
    const result = await loadChain("C0", async (id) => {
      reads += 1;
      return revision(id, `C${reads}`);
    }, { max: 3 });
    expect(reads).toBe(3);
    expect(result.complete).toBe(false);
  });
});

describe("the Review tab in the URL (spec 6.1)", () => {
  it("names the tab in the URL and reads it back", () => {
    expect(checklistHref("L1", "C1", "review")).toBe("/workspace/owner-leads/L1/survey-checklists/C1?tab=review");
    expect(tabOf("review")).toBe("review");
    expect(tabOf("other")).toBe("edit");
  });
});

describe("withMark", () => {
  it("returns a new form and leaves the other marks", () => {
    const first = withMark(EMPTY_REVIEW_FORM, "M1", { rejected: true, reason: "a" });
    const second = withMark(first, "M2", { rejected: true, reason: "b" });
    expect(EMPTY_REVIEW_FORM.marks).toEqual({});
    expect(Object.keys(second.marks)).toEqual(["M1", "M2"]);
  });
});
