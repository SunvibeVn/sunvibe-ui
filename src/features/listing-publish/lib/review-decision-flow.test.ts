import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ListingRevisionChange } from "../types";

import { type DecisionFormValues, EMPTY_DECISION_FORM } from "./review-decision-form";
import { decisionFormStateOf, type ReviewDecisionOutcome, runReviewDecision } from "./review-decision-flow";

const t = createTranslator({ locale: "en", messages: en, namespace: "ListingPublish" });

const LISTING_ID = "01JG000000000000000000000L";
const RETURN: DecisionFormValues = { ...EMPTY_DECISION_FORM, outcome: "NEEDS_CHANGES", changeReasons: ["MISSING_INFORMATION"], note: "Thiếu diện tích." };

const http = (status: number, code: string, fields: string[] = []): ApiResult<ListingRevisionChange> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: fields.map((field) => ({ field, message: "Fixed server message." })),
});

async function outcomeOf(result: ApiResult<ListingRevisionChange>, values = RETURN) {
  const decide = vi.fn(async () => result);
  const outcome = await runReviewDecision({ listingId: LISTING_ID, revisionNo: 2, values, dataVersion: 9 }, { decide });
  return { outcome, decide };
}

/** The sentence an outcome shows, with the reasons of a 403 REVIEWER_NOT_INDEPENDENT. */
function shown(outcome: ReviewDecisionOutcome): string[] {
  const state = decisionFormStateOf(outcome);
  return [state.messageKey === undefined ? "" : t(state.messageKey), ...(state.reasonKeys ?? []).map((key) => t(key))];
}

describe("review decision flow (listing-publish E06-S4, spec section 6, E06S4-D5)", () => {
  it("runReviewDecision_answers_outcomeByCode: one request with the chosen outcome's fields; each answer maps by status and code, never by text; the refusals the page must re-read for are marked", async () => {
    const decided = await outcomeOf({ ok: true, status: 200, replayed: false, data: { listingId: LISTING_ID, revisionNo: 2, status: "NEEDS_CHANGES", dataVersion: 10 } });
    expect(decided.outcome).toEqual({ kind: "decided" });
    expect(decided.decide).toHaveBeenCalledTimes(1);
    expect(decided.decide).toHaveBeenCalledWith(LISTING_ID, 2, { dataVersion: 9, outcome: "NEEDS_CHANGES", changeReasons: ["MISSING_INFORMATION"], note: "Thiếu diện tích." });

    const rows: [ApiResult<ListingRevisionChange>, ReviewDecisionOutcome["kind"], string[]][] = [
      [http(400, "VALIDATION_FAILED", ["decisionMatchesOutcome"]), "refused", ["Complete the decision: choose what it needs and write a note."]],
      [http(400, "VALIDATION_FAILED", ["note", "decisionMatchesOutcome"]), "refused", ["Complete the decision: choose what it needs and write a note."]],
      [http(400, "VALIDATION_FAILED", ["note"]), "refused", ["The note is too long or holds a character that cannot be stored."]],
      [http(400, "VALIDATION_FAILED", ["checks[2]"]), "refused", ["This decision could not be sent. Reload the page and try again."]],
      [http(400, "VALIDATION_FAILED", ["dataVersion"]), "refused", ["This decision could not be sent. Reload the page and try again."]],
      [http(400, "MALFORMED_REQUEST"), "refused", ["This decision could not be sent. Reload the page and try again."]],
      [http(403, "FORBIDDEN"), "refused", ["You cannot decide on this revision."]],
      [
        http(403, "REVIEWER_NOT_INDEPENDENT", ["reasons.AUTHOR", "reasons.ASSIGNED_SALE"]),
        "reread",
        ["The decision was not recorded:", "You created or edited this revision.", "You are the listing's assigned Sale."],
      ],
      [http(404, "NOT_FOUND"), "refused", ["This revision is not available."]],
      [http(409, "CONCURRENT_MODIFICATION"), "reread", ["The listing changed meanwhile. Check the revision again before you decide."]],
      [http(409, "REVISION_TERMS_MISMATCH"), "reread", ["The revision's terms equal no version of the agreement: it cannot be approved."]],
      [http(409, "REVISION_NOT_PENDING"), "reread", ["This revision was decided or withdrawn meanwhile; it can no longer be decided."]],
      [http(409, "LISTING_ARCHIVED"), "reread", ["The listing is archived; nothing can be decided on it."]],
      [http(409, "SOMETHING_NEW"), "reread", ["Something went wrong. Try again."]],
      [http(500, "INTERNAL_ERROR"), "refused", ["Something went wrong. Try again."]],
      [{ ok: false, kind: "network" }, "refused", ["Something went wrong. Try again."]],
    ];
    for (const [result, kind, sentences] of rows) {
      const { outcome } = await outcomeOf(result);
      expect(outcome.kind).toBe(kind);
      expect(shown(outcome)).toEqual(sentences);
    }

    for (const result of [{ ok: false, kind: "signed-out" }, { ok: false, kind: "unavailable" }] as ApiResult<ListingRevisionChange>[]) {
      const { outcome } = await outcomeOf(result);
      expect(outcome).toEqual({ kind: "silent" });
      expect(decisionFormStateOf(outcome)).toEqual({ status: "idle" });
    }
  });

  it("runReviewDecision_schemaRefuses_nothingSent: values the schema refuses send nothing and show the field's problem", async () => {
    const { outcome, decide } = await outcomeOf({ ok: true, status: 200, replayed: false, data: { listingId: LISTING_ID, revisionNo: 2, status: "NEEDS_CHANGES", dataVersion: 10 } }, {
      ...RETURN,
      note: "a".repeat(1001),
    });
    expect(decide).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "invalid", fieldErrors: { note: "noteTooLong" } });
    expect(decisionFormStateOf(outcome)).toEqual({ status: "error", fieldErrors: { note: "noteTooLong" } });
  });
});
