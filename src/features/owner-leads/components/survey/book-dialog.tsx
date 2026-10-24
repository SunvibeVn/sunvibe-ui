"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { type AppointmentKind, bookSurvey, type SurveyCommandResult } from "@/features/surveys";
import { formatDateTime, localInputToInstant } from "@/lib/format/vietnam-time";

import { useFormDraft } from "../../lib/drafts";
import { type Place, placeDiffersFromLead } from "../../lib/survey/appointment-view";
import { type BookingField, bookingDefaults, toBookBody, validateBooking } from "../../lib/survey/booking-form";
import {
  ACCESS_NOTE_MAX,
  CONTACT_MAX,
  DURATIONS,
  durationOf,
  minuteInstant,
  REASON_MAX,
} from "../../schemas/survey/survey-text";
import { useLeadDetail } from "../lead-detail-context";

import { OverlapWarning } from "./overlap-warning";
import { PlaceFields } from "./place-fields";
import { problemText } from "./survey-copy";
import { SurveyMessage } from "./survey-message";
import { SurveyTextField } from "./survey-text-field";
import { useSurveyCommand } from "./use-survey-command";

/** API field -> field of this dialog, for a 400 (spec 7.3). */
const FIELDS: Readonly<Record<string, BookingField>> = {
  startAt: "start",
  durationMinutes: "duration",
  "meetingLocation.addressText": "address",
  "meetingLocation.wardCode": "ward",
  "meetingLocation.provinceCode": "ward",
  "meetingLocation.latitude": "address",
  "meetingLocation.longitude": "address",
  meetingLocation: "address",
  locationReason: "locationReason",
  accessNote: "accessNote",
  onSiteContactName: "onSiteContactName",
  onSiteContactRole: "onSiteContactRole",
  confirmationNote: "confirmationNote",
  resurveyReason: "resurveyReason",
};

const BOX = "h-4 w-4 accent-violet-600";

type BookDialogProps = {
  kind: AppointmentKind;
  leadPlace: Place;
  onClose(): void;
  /** Saved: the section closes the dialog and shows the answer's overlaps. */
  onSaved(result: SurveyCommandResult): void;
};

/**
 * "Book survey" / "Book re-survey" (spec 6.2, US-1, US-3 AC-2): the start in Vietnam time, the duration, the meeting
 * place prefilled from the lead, a reason when it differs, access note and on-site contact with the reminder, "Owner
 * confirmed" (unticked) and, for a re-survey, its reason. The overlap pre-check warns before saving; a summary shows
 * what will be saved. Every field stays in the tab's draft until it is saved.
 */
export function BookDialog({ kind, leadPlace, onClose, onSaved }: BookDialogProps) {
  const t = useTranslations("OwnerLeads");
  const { userId, leadId, lead, version } = useLeadDetail();
  const defaults = bookingDefaults(leadPlace);
  const [form, setForm, clearForm] = useFormDraft({ userId, leadId, form: "surveyBook" }, defaults);

  const { state, dispatch, pending } = useSurveyCommand<BookingField>({
    fields: FIELDS,
    check: () => validateBooking(form, { kind, leadPlace, now: Date.now() }),
    send: () => bookSurvey(leadId, toBookBody(form, { kind, leadPlace, leadVersion: version ?? 0 })),
    onSaved: (result) => {
      clearForm(form);
      onSaved(result);
    },
  });

  const formId = useId();
  const ids = {
    start: useId(),
    duration: useId(),
    locationReason: useId(),
    accessNote: useId(),
    onSiteName: useId(),
    onSiteRole: useId(),
    confirmed: useId(),
    confirmationNote: useId(),
    resurveyReason: useId(),
  };
  const problem = state.problems;
  const set = (change: Partial<typeof form>) => setForm({ ...form, ...change });
  const differs = placeDiffersFromLead(form.place, leadPlace);

  const startAt = minuteInstant(form.start, localInputToInstant);
  const minutes = durationOf(form.duration);
  const surveyor = lead.assignedUserName?.trim() || t("survey.unknownPerson");
  const durationError = problem.duration === undefined ? undefined : problemText(t, problem.duration);

  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={kind === "RESURVEY" ? t("survey.bookDialog.titleResurvey") : t("survey.bookDialog.title")}
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
          <OverlapWarning leadId={leadId} start={form.start} duration={form.duration} />

          <PlaceFields
            place={form.place}
            leadPlace={leadPlace}
            onChange={(place) => set({ place })}
            addressProblem={problem.address}
            wardProblem={problem.ward}
            readOnly={pending}
          />
          {differs && (
            <SurveyTextField
              id={ids.locationReason}
              label={t("survey.form.locationReason")}
              required
              rows={2}
              value={form.locationReason}
              onChange={(locationReason) => set({ locationReason })}
              error={problem.locationReason === undefined ? undefined : problemText(t, problem.locationReason, "text", REASON_MAX)}
            />
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

          {kind === "RESURVEY" && (
            <SurveyTextField
              id={ids.resurveyReason}
              label={t("survey.form.resurveyReason")}
              required
              rows={2}
              value={form.resurveyReason}
              onChange={(resurveyReason) => set({ resurveyReason })}
              error={problem.resurveyReason === undefined ? undefined : problemText(t, problem.resurveyReason, "text", REASON_MAX)}
            />
          )}

          <div className="space-y-1">
            <label htmlFor={ids.confirmed} className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                id={ids.confirmed}
                type="checkbox"
                className={BOX}
                checked={form.ownerConfirmed}
                onChange={(event) => set({ ownerConfirmed: event.target.checked })}
              />
              {t("survey.form.ownerConfirmed")}
            </label>
            <p className="text-xs text-slate-500">{t("survey.form.ownerConfirmedHint")}</p>
          </div>
          {form.ownerConfirmed && (
            <SurveyTextField
              id={ids.confirmationNote}
              label={t("survey.form.confirmationNote")}
              optional
              rows={2}
              value={form.confirmationNote}
              onChange={(confirmationNote) => set({ confirmationNote })}
              error={
                problem.confirmationNote === undefined
                  ? undefined
                  : problemText(t, problem.confirmationNote, "text", REASON_MAX)
              }
            />
          )}

          {/* What will be saved (brief section 8): surveyor, Vietnam time, place, confirmation state. */}
          <section aria-label={t("survey.form.summary")} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <p className="font-semibold text-slate-900">{t("survey.form.summary")}</p>
            <dl className="mt-1 grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
              <dt className="text-slate-500">{t("survey.fields.surveyor")}</dt>
              <dd>{surveyor}</dd>
              <dt className="text-slate-500">{t("survey.fields.when")}</dt>
              <dd>
                {typeof startAt === "number" && minutes !== null
                  ? t("survey.form.summaryWhen", { time: formatDateTime(new Date(startAt).toISOString()), minutes })
                  : "—"}
              </dd>
              <dt className="text-slate-500">{t("survey.fields.meetingPlace")}</dt>
              <dd className="break-words">{form.place.addressText.trim() || "—"}</dd>
              <dt className="text-slate-500">{t("survey.fields.confirmation")}</dt>
              <dd>{form.ownerConfirmed ? t("survey.confirmation.confirmed") : t("survey.confirmation.notConfirmed")}</dd>
            </dl>
          </section>
        </fieldset>
      </form>
    </Dialog>
  );
}
