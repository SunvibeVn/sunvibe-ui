"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import type { SurveyAppointment, SurveyResumption } from "@/features/surveys";
import { formatDate, formatDateTime } from "@/lib/format/vietnam-time";

import { RevisionList } from "./revision-list";
import { SurveyPlace } from "./survey-place";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-3 sm:gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-slate-900 sm:col-span-2">{children}</dd>
    </div>
  );
}

type AppointmentHistoryProps = {
  appointments: readonly NonNullable<SurveyAppointment>[];
  resumptions: readonly SurveyResumption[];
};

/**
 * Earlier appointments, newest first, collapsed (spec 6.1): a visit with performer, arrival, own or proxy record,
 * recorder and recording time, note, proxy reason and basis; a cancellation with reason, description, by and at; the
 * revisions of each. The survey resumptions follow.
 */
export function AppointmentHistory({ appointments, resumptions }: AppointmentHistoryProps) {
  const t = useTranslations("OwnerLeads");
  const resumed = resumptions.filter((entry): entry is NonNullable<SurveyResumption> => entry !== null);
  if (appointments.length === 0 && resumed.length === 0) return null;
  const who = (name: string | null | undefined, time: string | null | undefined) =>
    t("survey.personTime", { name: name?.trim() || t("survey.unknownPerson"), time: time ? formatDateTime(time) : "" });
  const basis = (value: { confirmedOn?: string | null; text?: string | null } | null | undefined) =>
    value ? t("survey.basisValue", { date: value.confirmedOn ? formatDate(value.confirmedOn) : "", text: value.text ?? "" }) : "";

  return (
    <details className="rounded-xl border border-slate-200">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-violet-700">
        {t("survey.earlier", { count: appointments.length })}
      </summary>
      <div className="space-y-4 border-t border-slate-100 px-4 py-3">
        {appointments.map((appointment) => {
          const { visit, cancellation } = appointment;
          const kind = appointment.kind ?? "FIRST";
          return (
            <article key={appointment.id ?? appointment.appointmentNo} className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold text-slate-900">
                  {t("survey.appointmentTitle", { kind: t(`survey.kind.${kind}`), no: appointment.appointmentNo ?? "" })}
                </h4>
                <Badge tone={appointment.status === "VISITED" ? "success" : "neutral"}>
                  {t(appointment.status === "VISITED" ? "survey.status.VISITED" : "survey.status.CANCELLED")}
                </Badge>
                <span className="text-slate-600">{appointment.startAt ? formatDateTime(appointment.startAt) : ""}</span>
              </div>
              <dl className="space-y-1">
                <Row label={t("survey.fields.meetingPlace")}>
                  <SurveyPlace location={appointment.meetingLocation} />
                </Row>
                {visit && (
                  <>
                    <Row label={t("survey.visit.performer")}>{visit.performedByName?.trim() || t("survey.unknownPerson")}</Row>
                    <Row label={t("survey.visit.arrivedAt")}>{visit.arrivedAt ? formatDateTime(visit.arrivedAt) : ""}</Row>
                    <Row label={t("survey.visit.recordedBy")}>
                      {visit.recordKind ? `${t(`survey.visit.recordKind.${visit.recordKind}`)} · ` : ""}
                      {who(visit.recordedByName, visit.recordedAt)}
                    </Row>
                    <Row label={t("survey.visit.note")}>{visit.note ?? ""}</Row>
                    {visit.proxy && (
                      <>
                        <Row label={t("survey.visit.proxyReason")}>{visit.proxy.reason ?? ""}</Row>
                        <Row label={t("survey.visit.basis")}>{basis(visit.proxy.basis)}</Row>
                      </>
                    )}
                  </>
                )}
                {cancellation && (
                  <>
                    <Row label={t("survey.cancellation.reason")}>
                      {cancellation.cancelReason ? t(`survey.cancelReason.${cancellation.cancelReason}`) : ""}
                    </Row>
                    {cancellation.description?.trim() && (
                      <Row label={t("survey.cancellation.description")}>{cancellation.description}</Row>
                    )}
                    <Row label={t("survey.cancellation.by")}>{who(cancellation.cancelledByName, cancellation.cancelledAt)}</Row>
                  </>
                )}
              </dl>
              <RevisionList revisions={appointment.revisions ?? []} />
            </article>
          );
        })}
        {resumed.length > 0 && (
          <section className="space-y-2 text-sm">
            <h4 className="font-semibold text-slate-900">{t("survey.resumptions.title")}</h4>
            {resumed.map((entry, index) => (
              <dl key={`${entry.occurredAt ?? ""}-${index}`} className="space-y-1 rounded-lg bg-slate-50 px-3 py-2">
                <Row label={t("survey.resumptions.by")}>
                  {t("survey.resumptions.item", { no: entry.visitAppointmentNo ?? "" })}
                  {" · "}
                  {who(entry.actorName, entry.occurredAt)}
                </Row>
                <Row label={t("survey.resumptions.reason")}>{entry.reason ?? ""}</Row>
                <Row label={t("survey.resumptions.basis")}>{basis(entry.basis)}</Row>
              </dl>
            ))}
          </section>
        )}
      </div>
    </details>
  );
}
