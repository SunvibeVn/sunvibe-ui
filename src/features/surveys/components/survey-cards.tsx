"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format/vietnam-time";

import { type SurveySection, surveyLeadHref } from "../lib/survey-groups";
import type { SurveyListItem } from "../types";

import { SurveyConfirmationBadge } from "./survey-confirmation-badge";

type Row = NonNullable<SurveyListItem>;

const CARD = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const WRAP = "min-w-0 text-slate-800 [overflow-wrap:anywhere]";

/**
 * The survey list below `md` (spec 6.5): the groups as headings, one card per appointment with the fields of the
 * table, "View" as a large tap target opening the lead's Survey section without prefetch.
 */
export function SurveyCards({ sections }: { sections: readonly SurveySection<Row>[] }) {
  const t = useTranslations("Surveys");
  return (
    <div className="space-y-4 md:hidden">
      {sections.map((section, sectionIndex) => (
        <section key={`${section.group}-${sectionIndex}`} aria-label={t(`groups.${section.group}`)} className="space-y-3">
          <h2 className={`text-sm font-semibold ${section.group === "OVERDUE" ? "text-rose-700" : "text-slate-900"}`}>
            {t(`groups.${section.group}`)}
          </h2>
          <ul className="space-y-3">
            {section.items.map((row, index) => {
              const code = row.requestCode ?? "";
              return (
                <li key={row.id ?? `${code}-${index}`} className={CARD}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 font-mono text-[13px] font-bold text-slate-900 [overflow-wrap:anywhere]">
                      {code}
                      {row.kind === "RESURVEY" && (
                        <span className="ml-2 font-sans text-xs font-normal text-slate-500">{t("kind.RESURVEY")}</span>
                      )}
                    </span>
                    <SurveyConfirmationBadge confirmation={row.confirmation} />
                  </div>
                  {row.cannotBePerformed && (
                    <div className="mt-2">
                      <Badge tone="danger" wrap>{t("flag")}</Badge>
                    </div>
                  )}
                  <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                    <dt className="text-slate-500">{t("columns.when")}</dt>
                    <dd className={WRAP}>{row.startAt ? formatDateTime(row.startAt) : ""}</dd>
                    <dt className="text-slate-500">{t("columns.duration")}</dt>
                    <dd className={WRAP}>{t("minutes", { minutes: row.durationMinutes ?? 0 })}</dd>
                    <dt className="text-slate-500">{t("columns.owner")}</dt>
                    <dd className={WRAP}>{row.ownerContactName ?? ""}</dd>
                    <dt className="text-slate-500">{t("columns.ward")}</dt>
                    <dd className={WRAP}>{row.wardName ?? ""}</dd>
                    <dt className="text-slate-500">{t("columns.surveyor")}</dt>
                    <dd className={WRAP}>{row.surveyorName?.trim() || t("unknown")}</dd>
                  </dl>
                  {row.leadId && (
                    <Link
                      href={surveyLeadHref(row.leadId)}
                      prefetch={false}
                      aria-label={t("viewLabel", { code })}
                      className="mt-3 flex min-h-11 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-sm font-semibold text-violet-700 hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                    >
                      {t("view")}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
