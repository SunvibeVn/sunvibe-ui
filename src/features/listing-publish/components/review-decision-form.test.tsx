import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import { type DecisionFormValues, EMPTY_DECISION_FORM } from "../lib/review-decision-form";
import type { ReviewDecisionOutcome } from "../lib/review-decision-flow";
import type { ListingRevisionChange } from "../types";

// The edge only: the decision call, so no request leaves the test.
vi.mock("../services/review-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/review-api")>()),
  decideListingRevision: vi.fn(),
}));

import { decideListingRevision } from "../services/review-api";

import { ReviewDecisionForm } from "./review-decision-form";

const v = en.ListingPublish.review;
const d = v.decision;
const LISTING_ID = "01JG000000000000000000000L";
const CHECKLIST = ["CONTENT_MATCHES_UNIT", "TEXT_FOLLOWS_RULES", "TERMS_MATCH_AGREEMENT", "NO_FRAUD_SIGNS", "AGREEMENT_END_AND_RIGHT"];
const CHECK_TEXTS = CHECKLIST.map((code) => v.checks[code as keyof typeof v.checks]);

const DECIDED: ApiResult<ListingRevisionChange> = {
  ok: true,
  status: 200,
  replayed: false,
  data: { listingId: LISTING_ID, revisionNo: 2, status: "NEEDS_CHANGES", dataVersion: 10 },
};
const http = (status: number, code: string, fields: string[] = []): ApiResult<ListingRevisionChange> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: fields.map((field) => ({ field, message: "Fixed server message." })),
});

/** A promise with its resolver, to hold an answer until the test lets it go. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

/** The page's part: it holds the values, so they would survive a re-read. */
function Harness({ termsMatch, onOutcome }: { termsMatch: string; onOutcome: (outcome: ReviewDecisionOutcome) => void }) {
  const [values, setValues] = useState<DecisionFormValues>(EMPTY_DECISION_FORM);
  return (
    <ReviewDecisionForm
      listingId={LISTING_ID}
      revisionNo={2}
      dataVersion={9}
      checklist={CHECKLIST}
      termsMatch={termsMatch}
      values={values}
      onValues={setValues}
      held={false}
      onOutcome={onOutcome}
    />
  );
}

function renderForm(termsMatch = "IN_EFFECT") {
  const onOutcome = vi.fn<(outcome: ReviewDecisionOutcome) => void>();
  const view = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <Harness termsMatch={termsMatch} onOutcome={onOutcome} />
    </NextIntlClientProvider>,
  );
  return { ...view, onOutcome };
}

const group = (name: string) => screen.queryByRole("group", { name });
const choose = (outcome: string) => fireEvent.click(within(group(d.outcome) as HTMLElement).getByRole("radio", { name: outcome }));
const submitButton = () => screen.getByRole("button", { name: d.submit }) as HTMLButtonElement;
const tickAll = (texts: string[]) => texts.forEach((text) => fireEvent.click(screen.getByRole("checkbox", { name: text })));
const typeNote = (note: string) => fireEvent.change(screen.getByRole("textbox", { name: d.note }), { target: { value: note } });

describe("ReviewDecisionForm (listing-publish US-4 AC-3, spec section 6, E06S4-D6, P10, P13)", () => {
  beforeEach(() => {
    vi.mocked(decideListingRevision).mockReset();
  });

  it("reviewDecisionForm_threeOutcomes_fieldsShown: the three decisions; Approve shows the five checks, Return the reasons and the note with its counter, Reject the groups and the note", () => {
    renderForm();

    expect(within(group(d.outcome) as HTMLElement).getAllByRole("radio").map((radio) => radio.closest("label")?.textContent)).toEqual([
      v.outcomes.APPROVED,
      v.outcomes.NEEDS_CHANGES,
      v.outcomes.REJECTED,
    ]);
    expect(group(d.checks)).toBeNull();
    expect(screen.queryByRole("textbox", { name: d.note })).toBeNull();
    expect(submitButton().disabled).toBe(true);

    choose(v.outcomes.APPROVED);
    expect(within(group(d.checks) as HTMLElement).getAllByRole("checkbox").map((box) => box.closest("label")?.textContent)).toEqual(CHECK_TEXTS);
    expect(screen.queryByRole("textbox", { name: d.note })).toBeNull();

    choose(v.outcomes.NEEDS_CHANGES);
    expect(group(d.checks)).toBeNull();
    expect(within(group(d.changeReasons) as HTMLElement).getAllByRole("checkbox").map((box) => box.closest("label")?.textContent)).toEqual([
      v.changeReasons.CONTENT_MISMATCH,
      v.changeReasons.TEXT_RULE_VIOLATION,
      v.changeReasons.MISSING_INFORMATION,
      v.changeReasons.TERMS_MISMATCH,
      v.changeReasons.OTHER,
    ]);
    typeNote("Thiếu diện tích.");
    expect(screen.getByText("16 / 1,000")).toBeTruthy();

    choose(v.outcomes.REJECTED);
    expect(group(d.changeReasons)).toBeNull();
    expect(within(group(d.rejectionGroup) as HTMLElement).getAllByRole("radio").map((radio) => radio.closest("label")?.textContent)).toEqual([
      v.rejectionGroups.SUSPECTED_FRAUD,
      v.rejectionGroups.WRONG_UNIT,
      v.rejectionGroups.SERIOUS_VIOLATION,
      v.rejectionGroups.OTHER,
    ]);
    // The note typed for the return is still there.
    expect((screen.getByRole("textbox", { name: d.note }) as HTMLTextAreaElement).value).toBe("Thiếu diện tích.");
    expect(submitButton().disabled).toBe(false);
  });

  it("reviewDecisionForm_approveDisabledUntilAllTickedAndWhileTermsNone: Approve is sent only with all five checks ticked, and never while the terms equal no version", () => {
    const view = renderForm();
    choose(v.outcomes.APPROVED);
    expect(submitButton().disabled).toBe(true);
    tickAll(CHECK_TEXTS.slice(0, 4));
    expect(submitButton().disabled).toBe(true);
    tickAll(CHECK_TEXTS.slice(4));
    expect(submitButton().disabled).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: CHECK_TEXTS[2] }));
    expect(submitButton().disabled).toBe(true);
    view.unmount();

    renderForm("NONE");
    choose(v.outcomes.APPROVED);
    tickAll(CHECK_TEXTS);
    expect(submitButton().disabled).toBe(true);
    // A return stays possible: the reviewer can return it with TERMS_MISMATCH (RV-7).
    choose(v.outcomes.NEEDS_CHANGES);
    expect(submitButton().disabled).toBe(false);
  });

  it("reviewDecisionForm_answers_sentenceByCode: each answer shows its one sentence, the reasons of a 403 REVIEWER_NOT_INDEPENDENT under it, and reaches the page", async () => {
    const rows: [ApiResult<ListingRevisionChange>, string[], ReviewDecisionOutcome["kind"]][] = [
      [http(400, "VALIDATION_FAILED", ["note"]), [d.answers.noteInvalid], "refused"],
      [http(403, "FORBIDDEN"), [d.answers.forbidden], "refused"],
      [http(403, "REVIEWER_NOT_INDEPENDENT", ["reasons.AUTHOR"]), [d.answers.notIndependent, v.ineligible.AUTHOR], "reread"],
      [http(404, "NOT_FOUND"), [d.answers.notFound], "refused"],
      [http(409, "CONCURRENT_MODIFICATION"), [d.answers.concurrent], "reread"],
      [http(409, "REVISION_TERMS_MISMATCH"), [d.answers.termsMismatch], "reread"],
      [http(409, "REVISION_NOT_PENDING"), [d.answers.notPending], "reread"],
      [http(409, "LISTING_ARCHIVED"), [d.answers.archived], "reread"],
      [http(500, "INTERNAL_ERROR"), [d.answers.failed], "refused"],
    ];
    for (const [result, texts, kind] of rows) {
      vi.mocked(decideListingRevision).mockResolvedValueOnce(result);
      const { onOutcome, unmount } = renderForm();
      choose(v.outcomes.REJECTED);
      fireEvent.click(screen.getByRole("radio", { name: v.rejectionGroups.WRONG_UNIT }));
      typeNote("Sai căn.");
      fireEvent.click(submitButton());
      const alert = await screen.findByRole("alert");
      expect([alert.querySelector("p")?.textContent, ...Array.from(alert.querySelectorAll("li"), (item) => item.textContent)]).toEqual(texts);
      expect(onOutcome).toHaveBeenCalledTimes(1);
      expect(onOutcome.mock.calls[0]?.[0].kind).toBe(kind);
      // The values stay as chosen after an answer.
      expect((screen.getByRole("radio", { name: v.rejectionGroups.WRONG_UNIT }) as HTMLInputElement).checked).toBe(true);
      unmount();
    }

    vi.mocked(decideListingRevision).mockResolvedValueOnce(DECIDED);
    const { onOutcome } = renderForm();
    choose(v.outcomes.NEEDS_CHANGES);
    fireEvent.click(screen.getByRole("checkbox", { name: v.changeReasons.MISSING_INFORMATION }));
    typeNote("Thiếu diện tích.");
    fireEvent.click(submitButton());
    await waitFor(() => expect(onOutcome).toHaveBeenCalledWith({ kind: "decided" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(decideListingRevision).toHaveBeenLastCalledWith(LISTING_ID, 2, {
      dataVersion: 9,
      outcome: "NEEDS_CHANGES",
      changeReasons: ["MISSING_INFORMATION"],
      note: "Thiếu diện tích.",
    });
  });

  it("reviewDecisionForm_doubleClick_oneRequest: a second press while the decision is sent sends nothing", async () => {
    const answer = deferred<ApiResult<ListingRevisionChange>>();
    vi.mocked(decideListingRevision).mockReturnValueOnce(answer.promise);
    const { onOutcome } = renderForm();
    choose(v.outcomes.APPROVED);
    tickAll(CHECK_TEXTS);

    const form = submitButton().form as HTMLFormElement;
    fireEvent.click(submitButton());
    fireEvent.click(submitButton());
    fireEvent.submit(form);
    await waitFor(() => expect(submitButton().disabled).toBe(true));
    expect(decideListingRevision).toHaveBeenCalledTimes(1);
    expect(decideListingRevision).toHaveBeenCalledWith(LISTING_ID, 2, { dataVersion: 9, outcome: "APPROVED", checks: CHECKLIST });

    await act(async () => answer.resolve(DECIDED));
    await waitFor(() => expect(onOutcome).toHaveBeenCalledTimes(1));
    expect(decideListingRevision).toHaveBeenCalledTimes(1);
  });

  it("reviewDecisionForm_returnWithoutReason_serverSentence: a return without a reason is sent as it is, and the server's 400 decisionMatchesOutcome reads its sentence", async () => {
    vi.mocked(decideListingRevision).mockResolvedValueOnce(http(400, "VALIDATION_FAILED", ["decisionMatchesOutcome"]));
    renderForm();
    choose(v.outcomes.NEEDS_CHANGES);
    typeNote("Thiếu diện tích.");
    expect(submitButton().disabled).toBe(false);
    fireEvent.click(submitButton());

    expect((await screen.findByRole("alert")).textContent).toBe(d.answers.decisionIncomplete);
    expect(decideListingRevision).toHaveBeenCalledWith(LISTING_ID, 2, {
      dataVersion: 9,
      outcome: "NEEDS_CHANGES",
      changeReasons: [],
      note: "Thiếu diện tích.",
    });
  });
});
