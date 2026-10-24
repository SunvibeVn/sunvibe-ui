"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { setConfirmation, type SurveyAppointment } from "@/features/surveys";

import { useFormDraft } from "../../lib/drafts";
import { cleanText, optionalText, problemsOf, REASON_MAX } from "../../schemas/survey/survey-text";
import { useLeadDetail } from "../lead-detail-context";

import { problemText } from "./survey-copy";
import { SurveyMessage } from "./survey-message";
import { SurveyTextField } from "./survey-text-field";
import { useSurveyCommand } from "./use-survey-command";

const NOTE = z.object({ note: optionalText(REASON_MAX) });
const DEFAULTS = { note: "" };

type ConfirmationDialogProps = {
  appointment: NonNullable<SurveyAppointment>;
  /** True: "Mark owner confirmed"; false: "Remove confirmation". */
  confirm: boolean;
  onClose(): void;
  onSaved(): void;
};

/** "Mark owner confirmed" / "Remove confirmation" with an optional note (spec 6.2, US-1 AC-5). */
export function ConfirmationDialog({ appointment, confirm, onClose, onSaved }: ConfirmationDialogProps) {
  const t = useTranslations("OwnerLeads");
  const { userId, leadId, version } = useLeadDetail();
  // Tied to this appointment and this direction: a note typed for another appointment, or for "Mark owner confirmed",
  // never prefills "Remove confirmation" (and the other way round).
  const [fields, setFields, clearFields] = useFormDraft(
    { userId, leadId, form: "surveyConfirm" },
    DEFAULTS,
    `${appointment.id ?? ""}:${confirm ? "confirm" : "unconfirm"}`,
  );
  const note = fields.note;
  const setNote = (value: string) => setFields({ note: value });

  const { state, dispatch, pending } = useSurveyCommand<"note">({
    fields: { note: "note" },
    check: () => problemsOf<"note">(NOTE.safeParse({ note })),
    send: () => {
      const text = cleanText(note);
      return setConfirmation(appointment.id ?? "", {
        expectedLeadVersion: version ?? 0,
        expectedAppointmentVersion: appointment.version ?? 0,
        confirmed: confirm,
        ...(text === "" ? {} : { note: text }),
      });
    },
    onSaved: () => {
      clearFields(fields);
      onSaved();
    },
  });

  const formId = useId();
  const noteId = useId();
  const problem = state.problems.note;

  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={confirm ? t("survey.confirmDialog.titleConfirm") : t("survey.confirmDialog.titleUnconfirm")}
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
        <p className="text-slate-700">
          {confirm ? t("survey.confirmDialog.textConfirm") : t("survey.confirmDialog.textUnconfirm")}
        </p>
        <fieldset disabled={pending}>
          <SurveyTextField
            id={noteId}
            label={t("survey.form.note")}
            optional
            rows={2}
            value={note}
            onChange={setNote}
            error={problem === undefined ? undefined : problemText(t, problem, "text", REASON_MAX)}
          />
        </fieldset>
      </form>
    </Dialog>
  );
}

