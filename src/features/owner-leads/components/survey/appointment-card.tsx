"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { SurveyAppointment } from "@/features/surveys";
import { formatDateTime } from "@/lib/format/vietnam-time";

import { placeDiffersFromLead, placeOf } from "../../lib/survey/appointment-view";

import { ConfirmationBadge } from "./confirmation-badge";
import { RevisionList } from "./revision-list";
import { SurveyPlace } from "./survey-place";

export type AppointmentAction = "edit" | "confirm" | "unconfirm" | "visit" | "cancel";

type AppointmentCardProps = {
  appointment: NonNullable<SurveyAppointment>;
  /** Number of the visit a re-survey follows, when known. */
  followsVisitNo?: number;
  /** Every button is disabled while any command of the page runs (CR-2). */
  busy: boolean;
  onAction(action: AppointmentAction): void;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{children}</dd>
    </div>
  );
}

/**
 * The SCHEDULED appointment (spec 6.1): number and kind, Vietnam time, duration, surveyor with the "cannot be
 * performed" flag, meeting place (map only with a pin, on click), the lead's place when it differs, access note,
 * on-site contact, the confirmation label with who and when, and its buttons.
 */
export function AppointmentCard({ appointment, followsVisitNo, busy, onAction }: AppointmentCardProps) {
  const t = useTranslations("OwnerLeads");
  const kind = appointment.kind ?? "FIRST";
  const confirmed = appointment.confirmation?.state === "CONFIRMED";
  const blocked = appointment.cannotBePerformed === true;
  const differs = placeDiffersFromLead(placeOf(appointment.meetingLocation), placeOf(appointment.leadLocation));
  const contact = [appointment.onSiteContactName?.trim(), appointment.onSiteContactRole?.trim()].filter(Boolean);
  const confirmation = appointment.confirmation;
  const revisions = appointment.revisions ?? [];

  return (
    <article className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold text-slate-900">
          {t("survey.appointmentTitle", { kind: t(`survey.kind.${kind}`), no: appointment.appointmentNo ?? "" })}
        </h3>
        <ConfirmationBadge confirmation={confirmation} />
        {followsVisitNo !== undefined && (
          <span className="text-sm text-slate-600">{t("survey.follows", { no: followsVisitNo })}</span>
        )}
      </div>

      {blocked && (
        <p role="status" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
          {t("survey.cannotBePerformed")}
        </p>
      )}

      <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label={t("survey.fields.when")}>
          <span className="whitespace-nowrap">{appointment.startAt ? formatDateTime(appointment.startAt) : ""}</span>
        </Field>
        <Field label={t("survey.fields.duration")}>{t("survey.minutes", { minutes: appointment.durationMinutes ?? 0 })}</Field>
        <Field label={t("survey.fields.surveyor")}>{appointment.surveyorName?.trim() || t("survey.unknownPerson")}</Field>
        <Field label={t("survey.fields.confirmation")}>
          {confirmation?.changedAt
            ? t("survey.personTime", {
                name: confirmation.changedByName?.trim() || t("survey.unknownPerson"),
                time: formatDateTime(confirmation.changedAt),
              })
            : "—"}
          {confirmation?.note?.trim() && <span className="mt-0.5 block whitespace-pre-wrap">{confirmation.note}</span>}
        </Field>
        <Field label={t("survey.fields.meetingPlace")}>
          <SurveyPlace location={appointment.meetingLocation} />
        </Field>
        {differs && (
          <Field label={t("survey.fields.leadPlace")}>
            <SurveyPlace location={appointment.leadLocation} />
          </Field>
        )}
        {appointment.locationReason?.trim() && (
          <Field label={t("survey.fields.locationReason")}>
            <span className="whitespace-pre-wrap">{appointment.locationReason}</span>
          </Field>
        )}
        {appointment.accessNote?.trim() && (
          <Field label={t("survey.fields.accessNote")}>
            <span className="whitespace-pre-wrap">{appointment.accessNote}</span>
          </Field>
        )}
        {contact.length > 0 && <Field label={t("survey.fields.onSiteContact")}>{contact.join(" · ")}</Field>}
        {appointment.resurveyReason?.trim() && (
          <Field label={t("survey.fields.resurveyReason")}>
            <span className="whitespace-pre-wrap">{appointment.resurveyReason}</span>
          </Field>
        )}
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="px-4 py-2" disabled={busy || blocked} onClick={() => onAction("edit")}>
          {t("survey.actions.edit")}
        </Button>
        <Button
          variant="secondary"
          className="px-4 py-2"
          disabled={busy || blocked}
          onClick={() => onAction(confirmed ? "unconfirm" : "confirm")}
        >
          {confirmed ? t("survey.actions.unconfirm") : t("survey.actions.confirm")}
        </Button>
        <Button className="px-4 py-2" disabled={busy} onClick={() => onAction("visit")}>
          {t("survey.actions.visit")}
        </Button>
        <Button variant="ghost" className="px-4 py-2" disabled={busy} onClick={() => onAction("cancel")}>
          {t("survey.actions.cancel")}
        </Button>
      </div>

      {revisions.length > 1 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-violet-700">{t("survey.revisions.title")}</summary>
          <div className="mt-2">
            <RevisionList revisions={revisions} />
          </div>
        </details>
      )}
    </article>
  );
}
