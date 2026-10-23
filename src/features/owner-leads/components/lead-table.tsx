"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

import type { LeadSummary } from "../types";

import { LeadStatusBadge } from "./lead-status-badge";
import { toLeadRow } from "./lead-row";
import { leadDetailHref } from "./list-href";

type LeadTableProps = {
  leads: readonly LeadSummary[];
};

const HEAD = "whitespace-nowrap px-3 py-3 text-[11px] font-bold tracking-wider text-slate-500";
const CELL = "px-3 py-3 align-top text-slate-800";

/**
 * The lead list from `md` up (C-46): at least 1200px wide, scrolls sideways when its box is narrower, no sort
 * control. CODE is plain text; the ACTION "View" link opens the detail without prefetch. No phone, email, address,
 * next action or assignee (BR-7, C-47).
 */
export function LeadTable({ leads }: LeadTableProps) {
  const t = useTranslations("OwnerLeads");
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
      <table className="w-full min-w-[1200px] text-left text-sm">
        <caption className="sr-only">{t("list.caption")}</caption>
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th scope="col" className={HEAD}>{t("list.columns.code")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.owner")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.ward")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.requirement")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.propertyType")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.status")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.created")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.lastUpdate")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.note")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.action")}</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, index) => {
            const row = toLeadRow(lead);
            return (
              <tr key={row.id ?? `${row.code}-${index}`} className="border-b border-slate-100 last:border-0">
                <td className={`${CELL} whitespace-nowrap font-mono text-[13px] font-bold`}>{row.code}</td>
                <td className={CELL}>{row.owner}</td>
                <td className={CELL}>{row.ward}</td>
                <td className={CELL}>{row.requirementKey === null ? "" : t(row.requirementKey)}</td>
                <td className={CELL}>{row.propertyTypeKey === null ? "" : t(row.propertyTypeKey)}</td>
                <td className={CELL}>
                  <LeadStatusBadge status={row.status} />
                </td>
                <td className={`${CELL} whitespace-nowrap`}>{row.created}</td>
                <td className={`${CELL} whitespace-nowrap`}>{row.lastUpdate}</td>
                <td className={CELL}>
                  {row.possibleDuplicate ? (
                    <Badge tone="warning">{t("list.possibleDuplicate")}</Badge>
                  ) : (
                    <span className="text-slate-500">{t("list.noNote")}</span>
                  )}
                </td>
                <td className={CELL}>
                  {row.id !== undefined && (
                    <Link
                      href={leadDetailHref(row.id)}
                      prefetch={false}
                      aria-label={t("list.viewLabel", { code: row.code })}
                      className="inline-flex min-h-10 items-center font-semibold text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                    >
                      {t("list.view")}
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
