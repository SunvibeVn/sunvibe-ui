"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { cancelAppointment, type SurveyAppointment, USER_CANCEL_REASONS } from "@/features/surveys";

import { useFormDraft } from "../../lib/drafts";
import { type CancelField, type CancelForm, toCancelBody, validateCancel } from "../../lib/survey/cancel-form";
import { REASON_MAX } from "../../schemas/survey/survey-text";
import { useLeadDetail } from "../lead-detail-context";

import { problemText } from "./survey-copy";
import { SurveyMessage } from "./survey-message";
import { SurveyTextField } from "./survey-text-field";
import { useSurveyCommand } from "./use-survey-command";

const FIELDS: Readonly<Record<string, CancelField>> = { cancelReason: "reason", description: "description" };
const DEFAULTS: CancelForm = { reason: "", description: "" };

type CancelDialogProps = {
  appointment: NonNullable<SurveyAppointment>;
  onClose(): void;
  onSaved(): void;
};

/**
 * "Cancel appointment" (spec 6.2, US-2 AC-2): one of the five user reasons and a description, required for Other.
 * An overdue appointment can be cancelled too (BR-4).
 */
export function CancelDialog({ appointment, onClose, onSaved }: CancelDialogProps) {
  const t = useTranslations("OwnerLeads");
  const { userId, leadId, version } = useLeadDetail();
  // Tied to this appointment: a draft of another one never prefills this cancellation.
  const [form, setForm, clearForm] = useFormDraft({ userId, leadId, form: "surveyCancel" }, DEFAULTS, appointment.id ?? "");

  const { state, dispatch, pending } = useSurveyCommand<CancelField>({
    fields: FIELDS,
    check: () => validateCancel(form),
    send: () =>
      cancelAppointment(
        appointment.id ?? "",
        toCancelBody(form, { leadVersion: version ?? 0, appointmentVersion: appointment.version ?? 0 }),
      ),
    onSaved: () => {
      clearForm(form);
      onSaved();
    },
  });

  const formId = useId();
  const reasonId = useId();
  const descriptionId = useId();
  const problem = state.problems;
  const reasonError = problem.reason === undefined ? undefined : problemText(t, problem.reason);

  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={t("survey.cancelDialog.title")}
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
          <FormField id={reasonId} label={t("survey.cancelDialog.reason")} required error={reasonError}>
            <Select
              id={reasonId}
              value={form.reason}
              invalid={reasonError !== undefined}
              aria-describedby={describedBy(reasonId, reasonError)}
              aria-required
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
            >
              <option value="">{t("survey.cancelDialog.reasonPlaceholder")}</option>
              {USER_CANCEL_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {t(`survey.cancelReason.${reason}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <SurveyTextField
            id={descriptionId}
            label={t("survey.cancelDialog.description")}
            required={form.reason === "OTHER"}
            optional={form.reason !== "OTHER"}
            rows={3}
            value={form.description}
            onChange={(description) => setForm({ ...form, description })}
            error={problem.description === undefined ? undefined : problemText(t, problem.description, "text", REASON_MAX)}
          />
        </fieldset>
      </form>
    </Dialog>
  );
}
