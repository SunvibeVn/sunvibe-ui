"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format/vietnam-time";

import type { SurveySection } from "../lib/survey-groups";
import { surveyLeadHref } from "../lib/survey-groups";
import type { SurveyListItem } from "../types";

import { SurveyConfirmationBadge } from "./survey-confirmation-badge";

type Row = NonNullable<SurveyListItem>;

const HEAD = "whitespace-nowrap px-3 py-3 text-[11px] font-bold tracking-wider text-slate-500";
const CELL = "px-3 py-3 align-top text-slate-800";
const COLUMNS = 9;

/**
 * The survey list from `md` up (spec 6.5): one header row per group (Overdue, Today, Upcoming) in the API order, then
 * WHEN, DURATION, CODE, OWNER, WARD / COMMUNE, SURVEYOR, CONFIRMATION, FLAG, ACTION. No phone, address, coordinates,
 * access note or on-site contact (US-4 AC-1). "View" opens the lead's Survey section without prefetch.
 */
export function SurveyTable({ sections }: { sections: readonly SurveySection<Row>[] }) {
  const t = useTranslations("Surveys");
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
      <table className="w-full min-w-[960px] text-left text-sm">
        <caption className="sr-only">{t("caption")}</caption>
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th scope="col" className={HEAD}>{t("columns.when")}</th>
            <th scope="col" className={HEAD}>{t("columns.duration")}</th>
            <th scope="col" className={HEAD}>{t("columns.code")}</th>
            <th scope="col" className={HEAD}>{t("columns.owner")}</th>
            <th scope="col" className={HEAD}>{t("columns.ward")}</th>
            <th scope="col" className={HEAD}>{t("columns.surveyor")}</th>
            <th scope="col" className={HEAD}>{t("columns.confirmation")}</th>
            <th scope="col" className={HEAD}>{t("columns.flag")}</th>
            <th scope="col" className={HEAD}>{t("columns.action")}</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section, sectionIndex) => (
            <Fragment key={`${section.group}-${sectionIndex}`}>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th
                  scope="colgroup"
                  colSpan={COLUMNS}
                  className={`px-3 py-2 text-left text-sm font-semibold ${section.group === "OVERDUE" ? "text-rose-700" : "text-slate-900"}`}
                >
                  {t(`groups.${section.group}`)}
                </th>
              </tr>
              {section.items.map((row, index) => {
                const code = row.requestCode ?? "";
                return (
                  <tr key={row.id ?? `${code}-${index}`} className="border-b border-slate-100 last:border-0">
                    <td className={`${CELL} whitespace-nowrap`}>{row.startAt ? formatDateTime(row.startAt) : ""}</td>
                    <td className={`${CELL} whitespace-nowrap`}>{t("minutes", { minutes: row.durationMinutes ?? 0 })}</td>
                    <td className={`${CELL} whitespace-nowrap font-mono text-[13px] font-bold`}>
                      {code}
                      {row.kind === "RESURVEY" && (
                        <span className="ml-2 font-sans text-xs font-normal text-slate-500">{t("kind.RESURVEY")}</span>
                      )}
                    </td>
                    <td className={CELL}>{row.ownerContactName ?? ""}</td>
                    <td className={CELL}>{row.wardName ?? ""}</td>
                    <td className={CELL}>{row.surveyorName?.trim() || t("unknown")}</td>
                    <td className={CELL}>
                      <SurveyConfirmationBadge confirmation={row.confirmation} />
                    </td>
                    <td className={CELL}>
                      {row.cannotBePerformed ? (
                        <Badge tone="danger" wrap>{t("flag")}</Badge>
                      ) : (
                        <span className="text-slate-500">{t("noFlag")}</span>
                      )}
                    </td>
                    <td className={CELL}>
                      {row.leadId && (
                        <Link
                          href={surveyLeadHref(row.leadId)}
                          prefetch={false}
                          aria-label={t("viewLabel", { code })}
                          className="inline-flex min-h-10 items-center font-semibold text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                        >
                          {t("view")}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
