"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { todayInVietnam, vietnamDate } from "@/lib/format/vietnam-time";

import { useFormDraft } from "../../lib/drafts";
import type { IntakeField } from "../../lib/checklist/start-flow";
import { type ChecklistProblem, checkCorrection } from "../../schemas/checklist";
import { REASON_MAX } from "../../schemas/survey/survey-text";
import { checklistProblemText } from "../checklist/checklist-copy";
import { useLeadDetail } from "../lead-detail-context";

import { SurveyTextField } from "./survey-text-field";

const DEFAULTS = { reason: "", basisDate: "", basisText: "" };

type IntakeDialogProps = {
  surveyNo: number | null;
  performerName: string | null;
  arrivedAt: string | null;
  pending: boolean;
  /** Problems the server named on `intake.*` after a send. */
  serverProblems: Partial<Record<IntakeField, "invalid">>;
  /** A message above the fields (a refused start), already translated. */
  message: string | null;
  onClose(): void;
  onStart(intake: { reason: string; basis: { confirmedOn: string; text: string } }, done: () => void): void;
};

/**
 * The intake declaration of a start by someone other than the visit's performer (survey-checklist 4.5, BR-14): a
 * reason and a basis (date from the visit's arrival to today, text). The draft stays in tab memory until it starts.
 */
export function IntakeDialog({ surveyNo, performerName, arrivedAt, pending, serverProblems, message, onClose, onStart }: IntakeDialogProps) {
  const t = useTranslations("OwnerLeads");
  const { userId, leadId } = useLeadDetail();
  const [form, setForm, clearForm] = useFormDraft({ userId, leadId, form: "checklistIntake" }, DEFAULTS);
  const [problems, setProblems] = useState<Record<string, ChecklistProblem>>({});
  const formId = useId();
  const ids = { reason: useId(), date: useId(), text: useId() };
  const today = todayInVietnam();
  const arrivalDate = arrivedAt ? vietnamDate(arrivedAt) : "";
  const shown = (field: IntakeField): ChecklistProblem | undefined => problems[field] ?? serverProblems[field];
  const text = (field: IntakeField, kind: "text" | "date") => {
    const problem = shown(field);
    if (problem === undefined) return undefined;
    return checklistProblemText(t, problem, kind, REASON_MAX);
  };

  const submit = () => {
    const intake = { reason: form.reason, basis: { confirmedOn: form.basisDate, text: form.basisText } };
    const found = checkCorrection(intake, { today, arrivalDate });
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    onStart(intake, () => clearForm(form));
  };

  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={t("checklist.intake.title", { no: surveyNo ?? "" })}
      closeLabel={pending ? undefined : t("checklist.intake.close")}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {t("checklist.intake.close")}
          </Button>
          <Button type="submit" form={formId} pending={pending}>
            {pending ? t("checklist.intake.starting") : t("checklist.intake.start")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) submit();
        }}
      >
        <p className="text-sm text-slate-700">{t("checklist.intake.intro")}</p>
        {message !== null && (
          <div role="alert">
            <Alert tone="error">{message}</Alert>
          </div>
        )}
        <fieldset disabled={pending} className="space-y-4">
          <SurveyTextField
            id={ids.reason}
            label={t("checklist.intake.reason")}
            required
            rows={2}
            value={form.reason}
            onChange={(reason) => setForm({ ...form, reason })}
            error={text("reason", "text")}
          />
          <SurveyTextField
            id={ids.date}
            type="date"
            max={today}
            label={t("checklist.intake.basisDate")}
            required
            value={form.basisDate}
            onChange={(basisDate) => setForm({ ...form, basisDate })}
            error={text("basis.confirmedOn", "date")}
          />
          <SurveyTextField
            id={ids.text}
            label={t("checklist.intake.basisText")}
            required
            rows={2}
            hint={t("checklist.intake.hint", { performer: performerName?.trim() || t("survey.unknownPerson") })}
            value={form.basisText}
            onChange={(basisText) => setForm({ ...form, basisText })}
            error={text("basis.text", "text")}
          />
          <p className="text-xs text-amber-700">{t("survey.form.reminder")}</p>
        </fieldset>
      </form>
    </Dialog>
  );
}
