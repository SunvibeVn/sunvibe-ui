"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import type { SurveyAppointment } from "@/features/surveys";
import { formatDateTime } from "@/lib/format/vietnam-time";

import { checklistHref } from "../../lib/checklist/routes";
import { useLeadDetail } from "../lead-detail-context";

/**
 * The checklists of one VISITED appointment, newest first (survey-checklist spec 6.1): "Checklist #m · Draft · k items
 * missing · held by <name> · saved dd/MM/yyyy HH:mm by <name>" or the read-only reason, with "Open".
 */
export function ChecklistLines({ appointment }: { appointment: NonNullable<SurveyAppointment> }) {
  const t = useTranslations("OwnerLeads");
  const { leadId } = useLeadDetail();
  const checklists = (appointment.checklists ?? []).filter((entry) => entry?.id);
  if (appointment.status !== "VISITED" || checklists.length === 0) return null;
  const person = (name: string | null | undefined) => name?.trim() || t("survey.unknownPerson");
  return (
    <section className="space-y-1">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("checklist.lines.title")}</h5>
      <ul className="space-y-2">
        {checklists.map((entry) => {
          const reason = entry?.readOnlyReason;
          return (
            <li key={entry?.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2">
              <span className="min-w-0 break-words text-slate-900">
                {t("checklist.lines.line", {
                  no: entry?.checklistNo ?? "",
                  missing: entry?.missingCount ?? 0,
                  holder: person(entry?.holderName),
                })}
                {entry?.updatedByUserId && entry.updatedAt
                  ? ` · ${t("checklist.lines.saved", { when: formatDateTime(entry.updatedAt), name: person(entry.updatedByName) })}`
                  : ""}
              </span>
              {reason && entry?.editable !== true && <span className="text-slate-600">{t(`checklist.readOnly.${reason}`)}</span>}
              <Link
                href={checklistHref(leadId, entry?.id ?? "")}
                prefetch={false}
                className="font-medium text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
              >
                {t("checklist.lines.open", { no: entry?.checklistNo ?? "" })}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
