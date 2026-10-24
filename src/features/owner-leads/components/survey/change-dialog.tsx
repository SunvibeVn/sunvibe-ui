"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { changeAppointment, type SurveyAppointment } from "@/features/surveys";

import { useFormDraft } from "../../lib/drafts";
import { placeOf } from "../../lib/survey/appointment-view";
import {
  type ChangeField,
  changeDefaults,
  changeIsEmpty,
  changeRemovesConfirmation,
  toChangeBody,
  validateChange,
} from "../../lib/survey/change-form";
import { ACCESS_NOTE_MAX, CONTACT_MAX, DURATIONS, REASON_MAX } from "../../schemas/survey/survey-text";
import { useLeadDetail } from "../lead-detail-context";

import { OverlapWarning } from "./overlap-warning";
import { PlaceFields } from "./place-fields";
import { problemText } from "./survey-copy";
import { SurveyMessage } from "./survey-message";
import { SurveyTextField } from "./survey-text-field";
import { useSurveyCommand } from "./use-survey-command";

/** API field -> field of this dialog, for a 400 (spec 7.3). */
const FIELDS: Readonly<Record<string, ChangeField>> = {
  reason: "reason",
  startAt: "start",
  durationMinutes: "duration",
  "meetingLocation.addressText": "address",
  "meetingLocation.wardCode": "ward",
  "meetingLocation.provinceCode": "ward",
  "meetingLocation.latitude": "address",
  "meetingLocation.longitude": "address",
  meetingLocation: "address",
  accessNote: "accessNote",
  onSiteContactName: "onSiteContactName",
  onSiteContactRole: "onSiteContactRole",
};

type ChangeDialogProps = {
  appointment: NonNullable<SurveyAppointment>;
  onClose(): void;
  onSaved(): void;
};

/**
 * "Edit" of the scheduled appointment (spec 6.2, US-2 AC-1): every editable field with its current value and a
 * required reason; a note that a new time or place removes the owner confirmation; the overlap pre-check when the time
 * changes. The draft belongs to the appointment version the dialog was opened on (dropped when it is opened on another).
 */
export function ChangeDialog({ appointment, onClose, onSaved }: ChangeDialogProps) {
  const t = useTranslations("OwnerLeads");
  const { userId, leadId, version } = useLeadDetail();
  // The appointment and version this opening edits: a draft of another one is dropped on open, and a reload after a
  // conflict (a newer version) keeps what the user typed (spec 6.7). The draft holds only the fields the user changed,
  // over the current values, so the reload brings in what someone else changed and a resubmit does not undo it.
  const [tag] = useState(() => `${appointment.id ?? ""}:${appointment.version ?? 0}`);
  const defaults = changeDefaults(appointment);
  const [form, setForm, clearForm] = useFormDraft({ userId, leadId, form: "surveyChange" }, defaults, tag);

  const { state, dispatch, pending } = useSurveyCommand<ChangeField>({
    fields: FIELDS,
    check: () => validateChange(form, appointment, { now: Date.now() }),
    refuse: () => (changeIsEmpty(form, appointment) ? "nothingChanged" : null),
    send: () => changeAppointment(appointment.id ?? "", toChangeBody(form, appointment, version ?? 0)),
    onSaved: () => {
      clearForm(form);
      onSaved();
    },
  });

  const formId = useId();
  const ids = { start: useId(), duration: useId(), accessNote: useId(), onSiteName: useId(), onSiteRole: useId(), reason: useId() };
  const problem = state.problems;
  const set = (change: Partial<typeof form>) => setForm({ ...form, ...change });
  const timeChanged = form.start !== defaults.start || form.duration !== defaults.duration;
  const durationError = problem.duration === undefined ? undefined : problemText(t, problem.duration);
  // The lead's place at booking time (snapshot): "Use the lead address" goes back to it.
  const leadPlace = placeOf(appointment.leadLocation);

  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={t("survey.changeDialog.title")}
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
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <SurveyTextField
              id={ids.start}
              type="datetime-local"
              label={t("survey.form.start")}
              required
              value={form.start}
              onChange={(start) => set({ start })}
              error={problem.start === undefined ? undefined : problemText(t, problem.start, "start")}
            />
            <FormField id={ids.duration} label={t("survey.form.duration")} required error={durationError}>
              <Select
                id={ids.duration}
                value={form.duration}
                invalid={durationError !== undefined}
                aria-describedby={describedBy(ids.duration, durationError)}
                onChange={(event) => set({ duration: event.target.value })}
              >
                {DURATIONS.map((value) => (
                  <option key={value} value={String(value)}>
                    {t("survey.minutes", { minutes: value })}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <OverlapWarning
            leadId={leadId}
            start={form.start}
            duration={form.duration}
            excludeAppointmentId={appointment.id ?? undefined}
            enabled={timeChanged}
          />
          <PlaceFields
            place={form.place}
            leadPlace={leadPlace}
            onChange={(place) => set({ place })}
            addressProblem={problem.address}
            wardProblem={problem.ward}
            readOnly={pending}
          />
          {changeRemovesConfirmation(form, appointment) && (
            <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t("survey.form.removesConfirmation")}
            </p>
          )}
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">{t("survey.form.reminder")}</p>
          <SurveyTextField
            id={ids.accessNote}
            label={t("survey.form.accessNote")}
            optional
            rows={3}
            value={form.accessNote}
            onChange={(accessNote) => set({ accessNote })}
            error={problem.accessNote === undefined ? undefined : problemText(t, problem.accessNote, "text", ACCESS_NOTE_MAX)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SurveyTextField
              id={ids.onSiteName}
              label={t("survey.form.onSiteName")}
              optional
              value={form.onSiteContactName}
              onChange={(onSiteContactName) => set({ onSiteContactName })}
              error={
                problem.onSiteContactName === undefined
                  ? undefined
                  : problemText(t, problem.onSiteContactName, "text", CONTACT_MAX)
              }
            />
            <SurveyTextField
              id={ids.onSiteRole}
              label={t("survey.form.onSiteRole")}
              optional
              value={form.onSiteContactRole}
              onChange={(onSiteContactRole) => set({ onSiteContactRole })}
              error={
                problem.onSiteContactRole === undefined
                  ? undefined
                  : problemText(t, problem.onSiteContactRole, "text", CONTACT_MAX)
              }
            />
          </div>
          <SurveyTextField
            id={ids.reason}
            label={t("survey.form.reason")}
            required
            rows={2}
            value={form.reason}
            onChange={(reason) => set({ reason })}
            error={problem.reason === undefined ? undefined : problemText(t, problem.reason, "text", REASON_MAX)}
          />
        </fieldset>
      </form>
    </Dialog>
  );
}
