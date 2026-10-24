"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useLayoutEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toSurveyUiError } from "@/features/surveys";
import { vietnamDate } from "@/lib/format/vietnam-time";

import { useFormDraft } from "../lib/drafts";
import { intentLabelKey } from "../lib/labels";
import {
  offeredIntents,
  priceUnitOf,
  REQUIREMENT_DEFAULTS,
  type RequirementField,
  toIntentBody,
  validateRequirement,
} from "../lib/requirement-form";
import { surveyFailure } from "../lib/survey/survey-failure";
import { REASON_MAX, type SurveyProblem } from "../schemas/survey/survey-text";
import { changeIntent } from "../services/owner-leads-api";

import { useLeadDetail } from "./lead-detail-context";
import { problemText } from "./survey/survey-copy";
import { type SurveyDialogMessage, SurveyMessage } from "./survey/survey-message";
import { SurveyTextField } from "./survey/survey-text-field";

/** API field -> field of this dialog, for a 400 (spec 7.3). */
const FIELDS: Readonly<Record<string, RequirementField>> = {
  newIntent: "newIntent",
  askingPrice: "amount",
  "askingPrice.amount": "amount",
  "askingPrice.unit": "amount",
  "askingPrice.currency": "amount",
  reason: "reason",
  basis: "basisDate",
  "basis.confirmedOn": "basisDate",
  "basis.text": "basisText",
};

const BOX = "h-4 w-4 accent-violet-600";

type State = { problems: Partial<Record<RequirementField, SurveyProblem>>; message: SurveyDialogMessage | null };
const INITIAL: State = { problems: {}, message: null };

type RequirementDialogProps = { onClose(): void; onSaved(): void };

/**
 * "Change requirement" on the Property card (spec 6.2, US-5, A-18): the rental intents other than the current one
 * (never sale), a price per night or per month or "No price until confirmed", the reason and the owner's agreement
 * (date and text), with the warning that it cancels the scheduled survey and starts a new cycle. After the save the
 * lead and the survey block are read again (A-23); the owner's own submission is not changed.
 */
export function RequirementDialog({ onClose, onSaved }: RequirementDialogProps) {
  const t = useTranslations("OwnerLeads");
  const controller = useLeadDetail();
  const { userId, leadId, lead, version, setBusy } = controller;
  const [form, setForm, clearForm] = useFormDraft({ userId, leadId, form: "requirement" }, REQUIREMENT_DEFAULTS);
  const saved = useRef(false);

  const [state, dispatch, pending] = useActionState(async (prev: State): Promise<State> => {
    if (saved.current) return prev;
    const problems = validateRequirement(form, { current: lead.intent, leadCreatedAt: lead.createdAt, now: Date.now() });
    if (Object.keys(problems).length > 0) return { problems, message: null };
    const result = await changeIntent(leadId, toIntentBody(form, { leadVersion: version ?? 0 }));
    if (result.ok) {
      saved.current = true;
      // Version first, so it is current even when the reload fails (spec 5.2).
      controller.applyCommandResult(result.data);
      await controller.reload();
      clearForm(form);
      onSaved();
      return INITIAL;
    }
    const step = surveyFailure(toSurveyUiError(result) ?? { kind: "retry" }, FIELDS);
    switch (step.kind) {
      case "leave":
        controller.leaveToList();
        return prev;
      case "session":
        return prev;
      case "fields":
        return { problems: step.problems, message: null };
      case "message":
        if (step.reload) await controller.reload();
        return {
          problems: {},
          message: step.correlationId === undefined ? { message: step.message } : { message: step.message, correlationId: step.correlationId },
        };
    }
  }, INITIAL);

  // The page's one command lock (CR-2): taken in a layout effect on `pending`, released on unmount.
  useLayoutEffect(() => {
    setBusy("requirement", pending);
  }, [pending, setBusy]);
  useLayoutEffect(() => () => setBusy("requirement", false), [setBusy]);

  const formId = useId();
  const ids = { intent: useId(), amount: useId(), noPrice: useId(), reason: useId(), date: useId(), text: useId() };
  const problem = state.problems;
  const set = (change: Partial<typeof form>) => setForm({ ...form, ...change });
  const unit = priceUnitOf(form.newIntent);
  const intentError = problem.newIntent === undefined ? undefined : problemText(t, problem.newIntent);
  const amountError = problem.amount === undefined ? undefined : problemText(t, problem.amount);
  const currentKey = intentLabelKey(lead.intent);
  const today = vietnamDate(new Date().toISOString());

  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={t("requirement.title")}
      closeLabel={pending ? undefined : t("survey.form.close")}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {t("survey.form.close")}
          </Button>
          <Button type="submit" form={formId} pending={pending}>
            {pending ? t("survey.form.saving") : t("survey.form.save")}
          </Button>
        </>
      }
    >
      <form id={formId} action={dispatch} noValidate className="space-y-4">
        {state.message !== null && <SurveyMessage value={state.message} />}
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          {t("requirement.warning")}
        </p>
        {currentKey !== null && <p className="text-slate-700">{t("requirement.current", { intent: t(currentKey) })}</p>}
        <fieldset disabled={pending} className="space-y-4">
          <FormField id={ids.intent} label={t("requirement.newIntent")} required error={intentError}>
            <Select
              id={ids.intent}
              value={form.newIntent}
              invalid={intentError !== undefined}
              aria-describedby={describedBy(ids.intent, intentError)}
              aria-required
              onChange={(event) => set({ newIntent: event.target.value })}
            >
              <option value="">{t("requirement.newIntentPlaceholder")}</option>
              {offeredIntents(lead.intent).map((intent) => (
                <option key={intent} value={intent}>
                  {t(`intent.${intent}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id={ids.amount}
            label={
              unit === "NIGHT"
                ? t("requirement.pricePerNight")
                : unit === "MONTH"
                  ? t("requirement.pricePerMonth")
                  : t("requirement.price")
            }
            required={!form.noPrice}
            error={amountError}
          >
            <Input
              id={ids.amount}
              inputMode="numeric"
              value={form.amount}
              disabled={form.noPrice}
              invalid={amountError !== undefined}
              aria-describedby={describedBy(ids.amount, amountError)}
              onChange={(event) => set({ amount: event.target.value })}
            />
          </FormField>
          <label htmlFor={ids.noPrice} className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              id={ids.noPrice}
              type="checkbox"
              className={BOX}
              checked={form.noPrice}
              onChange={(event) => set({ noPrice: event.target.checked })}
            />
            {t("requirement.noPrice")}
          </label>
          <SurveyTextField
            id={ids.reason}
            label={t("requirement.reason")}
            required
            rows={2}
            value={form.reason}
            onChange={(reason) => set({ reason })}
            error={problem.reason === undefined ? undefined : problemText(t, problem.reason, "text", REASON_MAX)}
          />
          <SurveyTextField
            id={ids.date}
            type="date"
            max={today}
            label={t("requirement.basisDate")}
            required
            value={form.basisDate}
            onChange={(basisDate) => set({ basisDate })}
            error={problem.basisDate === undefined ? undefined : problemText(t, problem.basisDate, "date")}
          />
          <SurveyTextField
            id={ids.text}
            label={t("requirement.basisText")}
            required
            rows={2}
            value={form.basisText}
            onChange={(basisText) => set({ basisText })}
            error={problem.basisText === undefined ? undefined : problemText(t, problem.basisText, "text", REASON_MAX)}
          />
          <p className="text-xs text-slate-500">{t("survey.form.reminder")}</p>
        </fieldset>
      </form>
    </Dialog>
  );
}
