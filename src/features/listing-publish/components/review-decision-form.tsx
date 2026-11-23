"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef } from "react";

import { describedBy, FormField } from "@/components/ui/form-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

import { initialFormState } from "../lib/form-state";
import { type DecisionFormValues, mayApprove, noteCount } from "../lib/review-decision-form";
import {
  DECISION_ANSWER_KEYS,
  type DecisionFormState,
  decisionFormStateOf,
  type ReviewDecisionInput,
  type ReviewDecisionOutcome,
  runReviewDecision,
} from "../lib/review-decision-flow";
import { changeReasonKey, checkKey, outcomeKey, rejectionGroupKey } from "../lib/review-text";
import { CHANGE_REASONS, OUTCOMES, REJECTION_GROUPS, reviewDecisionSchema } from "../schemas/review-decision.schema";
import { decideListingRevision } from "../services/review-api";

import { ReviewAnswerNotice } from "./review-answer-notice";
import { useFieldErrors } from "./use-field-errors";

type ReviewDecisionFormProps = {
  listingId: string;
  revisionNo: number;
  /** The listing's data version of the review read shown; the decision sends it back (listing BR-3). */
  dataVersion: number;
  /** The checklist of the review read, version 1, in its order. */
  checklist: readonly string[];
  /** The review read's terms check: Approve waits while the terms equal no version (E06S4-D7). */
  termsMatch: string;
  /** The values, held by the page so a re-read in place keeps them (spec section 6). */
  values: DecisionFormValues;
  onValues: (values: DecisionFormValues) => void;
  /** The page reads the review again: the data version may be old, so the decision waits. */
  held: boolean;
  /** Every answer reaches the page, which reads again after a 200, a 403 `REVIEWER_NOT_INDEPENDENT` or a 409. */
  onOutcome: (outcome: ReviewDecisionOutcome) => void;
};

/** What one press of "Send decision" hands its action: the request's input and where its answer goes. */
type DecisionPress = { input: ReviewDecisionInput; onOutcome: (outcome: ReviewDecisionOutcome) => void };

const CHOICE_CLASS = "mt-0.5 h-4 w-4 shrink-0 accent-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

/** `list` with `code` added or removed, in the order of `order`. */
function toggled(list: readonly string[], code: string, order: readonly string[]): string[] {
  return list.includes(code) ? list.filter((entry) => entry !== code) : order.filter((entry) => entry === code || list.includes(entry));
}

/**
 * The decision of a Pending review revision (listing-publish US-4 AC-3 to AC-5, spec section 6, E06S4-D6, P10, P13):
 * "Decision" radios; for Approve the checklist's boxes, each required, sent only when all are ticked and the terms equal
 * a version; for a return the closed reasons and the note with its counter; for a rejection the group and the note.
 * A native form whose action checks the fields with the request's schema and sends one request with the chosen
 * outcome's fields; each answer shows its one sentence. The server decides the decision.
 */
export function ReviewDecisionForm({
  listingId,
  revisionNo,
  dataVersion,
  checklist,
  termsMatch,
  values,
  onValues,
  held,
  onOutcome,
}: ReviewDecisionFormProps) {
  const t = useTranslations("ListingPublish");
  const baseId = useId();
  const idOf = (name: string) => `${baseId}-${name}`;
  /** Set when "Send decision" is pressed, cleared when its action ends: a submit meanwhile is not even queued. */
  const sending = useRef(false);
  const messageRef = useRef<HTMLDivElement>(null);

  // The action reads nothing of a render: what it sends comes with the press (see `submit`).
  const [state, dispatch, pending] = useActionState<DecisionFormState, DecisionPress>(async (_previous, press) => {
    try {
      const outcome = await runReviewDecision(press.input, { decide: decideListingRevision });
      press.onOutcome(outcome);
      return decisionFormStateOf(outcome);
    } catch {
      return { status: "error", messageKey: DECISION_ANSWER_KEYS.failed };
    } finally {
      sending.current = false;
    }
  }, initialFormState);

  const fields = useFieldErrors(reviewDecisionSchema, values, state.fieldErrors);

  // An answer's sentence takes the focus, so a screen reader hears it.
  useEffect(() => {
    if (state.messageKey !== undefined) messageRef.current?.focus();
  }, [state]);

  // A press sends the values and the data version of the render on screen (listing BR-3). `dispatch` runs the action
  // React stored in the passive effect of a commit, which runs after the paint: a press just after a re-read enabled the
  // button would run the render before's action, with the old data version. The form's `action` (this function) is the
  // committed render's, so the press carries them.
  const submit = () => {
    if (sending.current) return;
    sending.current = true;
    dispatch({ input: { listingId, revisionNo, values, dataVersion }, onOutcome });
  };
  const set = (field: keyof DecisionFormValues, patch: Partial<DecisionFormValues>) => {
    fields.changed(field);
    onValues({ ...values, ...patch });
  };

  // A problem of a field the form does not show (a closed list) means the page is out of date: one sentence for it.
  const otherProblem = Object.keys(state.fieldErrors ?? {}).some((field) => field !== "note");
  const noteId = idOf("note");
  const noteError = fields.errorFor("note") === undefined ? undefined : t(DECISION_ANSWER_KEYS.noteInvalid);
  const outcome = values.outcome;
  const blocked = pending || held || outcome === null || (outcome === "APPROVED" && !mayApprove(values, checklist, termsMatch));

  return (
    <form
      action={submit}
      // Every field is controlled: the reset React makes after a form action would clear the choices on screen while
      // the page keeps them, so a refused decision would look emptied. The values stay as chosen (spec section 6).
      onReset={(event) => event.preventDefault()}
      noValidate
      className="min-w-0 space-y-4"
    >
      {(state.messageKey !== undefined || otherProblem) && (
        <div ref={messageRef} tabIndex={-1} className="focus:outline-none">
          <ReviewAnswerNotice messageKey={state.messageKey ?? DECISION_ANSWER_KEYS.invalid} reasonKeys={state.reasonKeys} />
        </div>
      )}
      <fieldset className="min-w-0 space-y-1.5">
        <legend className="text-sm font-medium text-slate-700">{t("review.decision.outcome")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {OUTCOMES.map((code) => (
            <label key={code} className="flex items-start gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name={idOf("outcome")}
                checked={outcome === code}
                disabled={pending}
                onChange={() => set("outcome", { outcome: code })}
                className={CHOICE_CLASS}
              />
              <span>{t(outcomeKey(code))}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {outcome === "APPROVED" && (
        <fieldset className="min-w-0 space-y-1.5">
          <legend className="text-sm font-medium text-slate-700">{t("review.decision.checks")}</legend>
          {checklist.map((code) => (
            <label key={code} className="flex items-start gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={values.checks.includes(code)}
                disabled={pending}
                aria-required
                onChange={() => set("checks", { checks: toggled(values.checks, code, checklist) })}
                className={CHOICE_CLASS}
              />
              <span>{t(checkKey(code))}</span>
            </label>
          ))}
        </fieldset>
      )}
      {outcome === "NEEDS_CHANGES" && (
        <fieldset className="min-w-0 space-y-1.5">
          <legend className="text-sm font-medium text-slate-700">{t("review.decision.changeReasons")}</legend>
          {CHANGE_REASONS.map((code) => (
            <label key={code} className="flex items-start gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={values.changeReasons.includes(code)}
                disabled={pending}
                onChange={() => set("changeReasons", { changeReasons: toggled(values.changeReasons, code, CHANGE_REASONS) })}
                className={CHOICE_CLASS}
              />
              <span>{t(changeReasonKey(code))}</span>
            </label>
          ))}
        </fieldset>
      )}
      {outcome === "REJECTED" && (
        <fieldset className="min-w-0 space-y-1.5">
          <legend className="text-sm font-medium text-slate-700">{t("review.decision.rejectionGroup")}</legend>
          {REJECTION_GROUPS.map((code) => (
            <label key={code} className="flex items-start gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name={idOf("rejectionGroup")}
                checked={values.rejectionGroup === code}
                disabled={pending}
                onChange={() => set("rejectionGroup", { rejectionGroup: code })}
                className={CHOICE_CLASS}
              />
              <span>{t(rejectionGroupKey(code))}</span>
            </label>
          ))}
        </fieldset>
      )}
      {(outcome === "NEEDS_CHANGES" || outcome === "REJECTED") && (
        <FormField id={noteId} label={t("review.decision.note")} error={noteError} hint={t("review.decision.noteCount", { count: noteCount(values.note) })}>
          <Textarea
            id={noteId}
            rows={4}
            value={values.note}
            disabled={pending}
            invalid={noteError !== undefined}
            aria-describedby={describedBy(noteId, noteError, true)}
            onChange={(event) => set("note", { note: event.target.value })}
            onBlur={() => fields.onBlur("note")}
          />
        </FormField>
      )}
      <SubmitButton fullWidth={false} disabled={blocked}>
        {t("review.decision.submit")}
      </SubmitButton>
    </form>
  );
}
