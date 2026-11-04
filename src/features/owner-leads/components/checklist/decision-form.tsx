"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import type { ChecklistDecisionRule, ChecklistFailedKind, ChecklistNeedsChangesKind, ChecklistOutcome } from "@/features/surveys";

import { REVIEW_TEXT_MAX, type ReviewField, type ReviewForm, ruleTextKey } from "../../lib/checklist/review-model";
import type { OwnerLeadsKey } from "../../lib/labels";
import type { SurveyProblems } from "../../schemas/survey/survey-text";
import { problemText } from "../survey/survey-copy";
import { SurveyTextField } from "../survey/survey-text-field";

const OUTCOMES: readonly ChecklistOutcome[] = ["PASSED", "NEEDS_CHANGES", "FAILED"];
const NEEDS_CHANGES_KINDS: readonly ChecklistNeedsChangesKind[] = ["DOCUMENTS_ONLY", "RESURVEY_REQUIRED"];
const FAILED_KINDS: readonly ChecklistFailedKind[] = ["OUT_OF_SCOPE", "NOT_ACCEPTED", "TEMPORARY"];

const OPTION = "flex min-h-9 items-center gap-2 text-sm";

type Choice<T extends string> = { value: T; label: string; disabled?: boolean };

function Choices<T extends string>({
  legend,
  name,
  choices,
  value,
  error,
  disabled,
  onChange,
}: {
  legend: string;
  name: string;
  choices: readonly Choice<T>[];
  value: string;
  error: string | undefined;
  disabled: boolean;
  onChange(value: T): void;
}) {
  return (
    <fieldset className="space-y-1" disabled={disabled}>
      <legend className="text-sm font-medium text-slate-700">
        {legend}
        <span aria-hidden="true" className="ml-0.5 text-rose-600">
          *
        </span>
      </legend>
      {choices.map((choice) => (
        <label key={choice.value} className={`${OPTION} ${choice.disabled ? "text-slate-400" : "text-slate-800"}`}>
          <input
            type="radio"
            className="accent-violet-600"
            name={name}
            checked={value === choice.value}
            disabled={choice.disabled}
            onChange={() => onChange(choice.value)}
          />
          {choice.label}
        </label>
      ))}
      {error !== undefined && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}

type DecisionFormProps = {
  form: ReviewForm;
  onChange(update: (form: ReviewForm) => ReviewForm): void;
  /** The rules that keep PASSED disabled; the server stays the judge. */
  blockers: readonly ChecklistDecisionRule[];
  /** Shown once the reviewer tried to send. */
  problems: SurveyProblems<ReviewField>;
  disabled: boolean;
};

/**
 * The fields of a decision (survey-checklist submission spec 6.1, U-3): outcome, its kind, reason, notes and limitations.
 * PASSED is disabled while a rule blocks it, with those rules; NEEDS_CHANGES and FAILED ask for a kind and a reason.
 * What was typed for another outcome stays in the form, and is not sent.
 */
export function DecisionForm({ form, onChange, blockers, problems, disabled }: DecisionFormProps) {
  const t = useTranslations("OwnerLeads");
  const ids = { outcome: useId(), kind: useId(), reason: useId(), notes: useId(), limitations: useId() };
  const set = (patch: Partial<ReviewForm>) => onChange((current) => ({ ...current, ...patch }));
  const textProblem = (field: ReviewField) => {
    const problem = problems[field];
    return problem === undefined ? undefined : problemText(t, problem, "text", REVIEW_TEXT_MAX);
  };
  const outcomeProblem: Partial<Record<string, OwnerLeadsKey>> = {
    required: "checklist.review.form.outcomeRequired",
    notAllowed: "checklist.review.form.outcomeBlocked",
  };
  const outcomeError = problems.outcome === undefined ? undefined : outcomeProblem[problems.outcome];
  const kindError = problems.kind === undefined ? undefined : t("checklist.review.form.kindRequired");
  const returned = form.outcome === "NEEDS_CHANGES" || form.outcome === "FAILED";
  return (
    <div className="space-y-4">
      <Choices
        legend={t("checklist.review.form.outcome")}
        name={ids.outcome}
        value={form.outcome}
        disabled={disabled}
        error={outcomeError === undefined ? undefined : t(outcomeError)}
        choices={OUTCOMES.map((value) => ({
          value,
          label: t(`checklist.review.outcome.${value}`),
          disabled: value === "PASSED" && blockers.length > 0,
        }))}
        onChange={(outcome) => set({ outcome })}
      />
      {blockers.length > 0 && (
        <div className="text-sm text-slate-700">
          <p className="font-medium">{t("checklist.review.form.passedBlocked")}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {blockers.map((rule) => (
              <li key={rule}>{t(ruleTextKey(rule))}</li>
            ))}
          </ul>
        </div>
      )}
      {form.outcome === "NEEDS_CHANGES" && (
        <Choices
          legend={t("checklist.review.form.needsChangesKind")}
          name={ids.kind}
          value={form.needsChangesKind}
          disabled={disabled}
          error={kindError}
          choices={NEEDS_CHANGES_KINDS.map((value) => ({ value, label: t(`checklist.review.form.kindLabel.${value}`) }))}
          onChange={(needsChangesKind) => set({ needsChangesKind })}
        />
      )}
      {form.outcome === "FAILED" && (
        <Choices
          legend={t("checklist.review.form.failedKind")}
          name={ids.kind}
          value={form.failedKind}
          disabled={disabled}
          error={kindError}
          choices={FAILED_KINDS.map((value) => ({ value, label: t(`checklist.review.form.kindLabel.${value}`) }))}
          onChange={(failedKind) => set({ failedKind })}
        />
      )}
      <fieldset disabled={disabled} className="space-y-4">
        {returned && (
          <SurveyTextField
            id={ids.reason}
            label={t("checklist.review.form.reason")}
            required
            rows={3}
            value={form.reason}
            onChange={(reason) => set({ reason })}
            error={textProblem("reason")}
          />
        )}
        <SurveyTextField
          id={ids.notes}
          label={t("checklist.review.form.notes")}
          optional
          rows={2}
          value={form.notes}
          onChange={(notes) => set({ notes })}
          error={textProblem("notes")}
        />
        {form.outcome === "PASSED" && (
          <SurveyTextField
            id={ids.limitations}
            label={t("checklist.review.form.limitations")}
            optional
            rows={2}
            value={form.limitations}
            onChange={(limitations) => set({ limitations })}
            error={textProblem("limitations")}
          />
        )}
      </fieldset>
    </div>
  );
}
