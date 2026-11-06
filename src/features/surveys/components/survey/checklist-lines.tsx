"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format/vietnam-time";

import { checklistHref } from "../../lib/checklist/routes";
import { checklistLineReason, revisionChip } from "../../lib/survey/appointment-view";

import type { SurveyAppointment } from "../../types";
import { useSurveyPanel } from "./survey-panel-context";

/**
 * The checklists of one VISITED appointment, newest first (survey-checklist spec 6.1): "Checklist #m · Draft · k items
 * missing · held by <name> · saved dd/MM/yyyy HH:mm by <name>" or the read-only reason, with "Open". A revision past the
 * draft shows its status as a chip (submission spec 6.2).
 */
export function ChecklistLines({ appointment }: { appointment: NonNullable<SurveyAppointment> }) {
  const t = useTranslations("OwnerLeads");
  const { leadId } = useSurveyPanel();
  const checklists = (appointment.checklists ?? []).filter((entry) => entry?.id);
  if (appointment.status !== "VISITED" || checklists.length === 0) return null;
  const person = (name: string | null | undefined) => name?.trim() || t("survey.unknownPerson");
  return (
    <section className="space-y-1">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("checklist.lines.title")}</h5>
      <ul className="space-y-2">
        {checklists.map((entry) => {
          const reason = entry ? checklistLineReason(entry) : null;
          const chip = entry ? revisionChip(entry) : null;
          return (
            <li key={entry?.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2">
              <span className="min-w-0 break-words text-slate-900">
                {chip === null
                  ? t("checklist.lines.line", {
                      no: entry?.checklistNo ?? "",
                      missing: entry?.missingCount ?? 0,
                      holder: person(entry?.holderName),
                    })
                  : t("checklist.lines.frozen", { no: entry?.checklistNo ?? "", holder: person(entry?.holderName) })}
                {entry?.updatedByUserId && entry.updatedAt
                  ? ` · ${t("checklist.lines.saved", { when: formatDateTime(entry.updatedAt), name: person(entry.updatedByName) })}`
                  : ""}
              </span>
              {chip !== null && <Badge tone={chip.tone}>{t(chip.label)}</Badge>}
              {reason !== null && <span className="text-slate-600">{t(reason)}</span>}
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
