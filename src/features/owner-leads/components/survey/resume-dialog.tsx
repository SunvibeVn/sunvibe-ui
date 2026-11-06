"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useFormDraft } from "@/features/lead-shared/client";
import { resumeSurvey } from "@/features/surveys";
import { vietnamDate } from "@/lib/format/vietnam-time";

import { type ResumeField, type ResumeForm, toResumeBody, validateResume } from "../../lib/survey/resume-form";
import { REASON_MAX } from "../../schemas/survey/survey-text";

import { problemText } from "./survey-copy";
import { SurveyMessage } from "./survey-message";
import { useSurveyPanel } from "./survey-panel-context";
import { SurveyTextField } from "./survey-text-field";
import { useSurveyCommand } from "./use-survey-command";

const FIELDS: Readonly<Record<string, ResumeField>> = {
  reason: "reason",
  basis: "basisDate",
  "basis.confirmedOn": "basisDate",
  "basis.text": "basisText",
};
const DEFAULTS: ResumeForm = { reason: "", basisDate: "", basisText: "" };

type ResumeDialogProps = {
  /** The lead returns to Qualified, not to Survey Scheduled (survey-checklist submission 4.8). */
  toQualified: boolean;
  onClose(): void;
  onSaved(): void;
};

/**
 * "Resume survey" (spec 6.2, BR-11): back from On Hold to Survey Scheduled for the current visit, or "Resume to
 * Qualified" with a usable pass, with a reason and the owner's confirmation (date and text) that requirement and scope
 * have not changed.
 */
export function ResumeDialog({ toQualified, onClose, onSaved }: ResumeDialogProps) {
  const t = useTranslations("OwnerLeads");
  const { userId, leadId, version } = useSurveyPanel();
  const [form, setForm, clearForm] = useFormDraft({ userId, leadId, form: "surveyResume" }, DEFAULTS);

  const { state, dispatch, pending } = useSurveyCommand<ResumeField>({
    fields: FIELDS,
    check: () => validateResume(form, { now: Date.now() }),
    send: () => resumeSurvey(leadId, toResumeBody(form, { leadVersion: version ?? 0 })),
    onSaved: () => {
      clearForm(form);
      onSaved();
    },
  });

  const formId = useId();
  const ids = { reason: useId(), date: useId(), text: useId() };
  const problem = state.problems;
  const today = vietnamDate(new Date().toISOString());

  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={t(toQualified ? "survey.resumeQualified" : "survey.resumeDialog.title")}
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
        <fieldset disabled={pending} className="space-y-4">
          <SurveyTextField
            id={ids.reason}
            label={t("survey.resumeDialog.reason")}
            required
            rows={2}
            value={form.reason}
            onChange={(reason) => setForm({ ...form, reason })}
            error={problem.reason === undefined ? undefined : problemText(t, problem.reason, "text", REASON_MAX)}
          />
          <SurveyTextField
            id={ids.date}
            type="date"
            max={today}
            label={t("survey.resumeDialog.basisDate")}
            required
            value={form.basisDate}
            onChange={(basisDate) => setForm({ ...form, basisDate })}
            error={problem.basisDate === undefined ? undefined : problemText(t, problem.basisDate, "date")}
          />
          <SurveyTextField
            id={ids.text}
            label={t("survey.resumeDialog.basisText")}
            required
            rows={2}
            hint={t("survey.resumeDialog.basisHint")}
            value={form.basisText}
            onChange={(basisText) => setForm({ ...form, basisText })}
            error={problem.basisText === undefined ? undefined : problemText(t, problem.basisText, "text", REASON_MAX)}
          />
        </fieldset>
      </form>
    </Dialog>
  );
}
