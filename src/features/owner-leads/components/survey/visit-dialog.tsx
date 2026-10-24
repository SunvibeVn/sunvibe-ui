"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { recordVisit, type SurveyAppointment } from "@/features/surveys";
import { vietnamDate } from "@/lib/format/vietnam-time";

import { useFormDraft } from "../../lib/drafts";
import { holderOptions, visitMode } from "../../lib/survey/appointment-view";
import { toVisitBody, type VisitField, validateVisit, visitDefaults } from "../../lib/survey/visit-form";
import { REASON_MAX, VISIT_NOTE_MAX } from "../../schemas/survey/survey-text";
import { useLeadDetail } from "../lead-detail-context";

import { problemText } from "./survey-copy";
import { SurveyMessage } from "./survey-message";
import { SurveyTextField } from "./survey-text-field";
import { useSurveyCommand } from "./use-survey-command";

const FIELDS: Readonly<Record<string, VisitField>> = {
  arrivedAt: "arrivedAt",
  note: "note",
  performedByUserId: "performerId",
  proxy: "proxyReason",
  "proxy.reason": "proxyReason",
  "proxy.basis": "basisDate",
  "proxy.basis.confirmedOn": "basisDate",
  "proxy.basis.text": "basisText",
};

type VisitDialogProps = {
  appointment: NonNullable<SurveyAppointment>;
  onClose(): void;
  onSaved(): void;
};

/**
 * "Record visit" (spec 6.2, US-3): the arrival time (now by default), a required note with the hint. When the
 * signed-in user is not the current surveyor, or picks someone else, it becomes a proxy record (managers only, A-8):
 * the performer from the appointment's holders, a reason and a basis.
 */
export function VisitDialog({ appointment, onClose, onSaved }: VisitDialogProps) {
  const t = useTranslations("OwnerLeads");
  const { userId, leadId, version, viewer } = useLeadDetail();
  // The defaults of this opening: "now" does not move while the user types.
  const [defaults] = useState(() => visitDefaults(Date.now(), userId, appointment));
  // Tied to this appointment: a draft of another one never prefills this record.
  const [form, setForm, clearForm] = useFormDraft({ userId, leadId, form: "surveyVisit" }, defaults, appointment.id ?? "");
  const canProxy = viewer.access === "ALL";
  const mode = visitMode(userId, appointment, form.performerId);
  const holders = holderOptions(appointment);

  const { state, dispatch, pending } = useSurveyCommand<VisitField>({
    fields: FIELDS,
    check: () => validateVisit(form, { mode, canProxy, now: Date.now() }),
    send: () =>
      recordVisit(appointment.id ?? "", toVisitBody(form, mode, { leadVersion: version ?? 0, appointment })),
    onSaved: () => {
      clearForm(form);
      onSaved();
    },
  });

  const formId = useId();
  const ids = { arrivedAt: useId(), note: useId(), performer: useId(), reason: useId(), date: useId(), text: useId() };
  const problem = state.problems;
  const set = (change: Partial<typeof form>) => setForm({ ...form, ...change });
  const performerError = problem.performerId === undefined ? undefined : problemText(t, problem.performerId);
  const today = vietnamDate(new Date().toISOString());

  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={t("survey.visitDialog.title")}
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
            id={ids.arrivedAt}
            type="datetime-local"
            label={t("survey.visitDialog.arrivedAt")}
            required
            value={form.arrivedAt}
            onChange={(arrivedAt) => set({ arrivedAt })}
            error={problem.arrivedAt === undefined ? undefined : problemText(t, problem.arrivedAt, "arrival")}
          />
          {canProxy && holders.length > 0 && (
            <FormField id={ids.performer} label={t("survey.visitDialog.performer")} required error={performerError}>
              <Select
                id={ids.performer}
                value={form.performerId}
                invalid={performerError !== undefined}
                aria-describedby={describedBy(ids.performer, performerError)}
                onChange={(event) => set({ performerId: event.target.value })}
              >
                {holders.map((holder) => (
                  <option key={holder.userId} value={holder.userId}>
                    {holder.name?.trim() || t("survey.unknownPerson")}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          {!canProxy && performerError !== undefined && <p className="text-sm text-rose-600">{performerError}</p>}
          <SurveyTextField
            id={ids.note}
            label={t("survey.visitDialog.note")}
            required
            rows={4}
            value={form.note}
            onChange={(note) => set({ note })}
            hint={t("survey.visitDialog.hint")}
            error={problem.note === undefined ? undefined : problemText(t, problem.note, "text", VISIT_NOTE_MAX)}
          />
          {mode === "proxy" && (
            <div className="space-y-4 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
              <p className="text-sm text-violet-900">{t("survey.visitDialog.proxyNotice")}</p>
              <SurveyTextField
                id={ids.reason}
                label={t("survey.visitDialog.proxyReason")}
                required
                rows={2}
                value={form.proxyReason}
                onChange={(proxyReason) => set({ proxyReason })}
                error={problem.proxyReason === undefined ? undefined : problemText(t, problem.proxyReason, "text", REASON_MAX)}
              />
              <SurveyTextField
                id={ids.date}
                type="date"
                max={today}
                label={t("survey.visitDialog.basisDate")}
                required
                value={form.basisDate}
                onChange={(basisDate) => set({ basisDate })}
                error={problem.basisDate === undefined ? undefined : problemText(t, problem.basisDate, "date")}
              />
              <SurveyTextField
                id={ids.text}
                label={t("survey.visitDialog.basisText")}
                required
                rows={2}
                value={form.basisText}
                onChange={(basisText) => set({ basisText })}
                error={problem.basisText === undefined ? undefined : problemText(t, problem.basisText, "text", REASON_MAX)}
              />
            </div>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}
