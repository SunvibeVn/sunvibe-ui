"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

import type { LeadSummary } from "../types";

import { LeadStatusBadge } from "./lead-status-badge";
import { toLeadRow } from "./lead-row";
import { leadDetailHref } from "./list-href";

type LeadCardsProps = {
  leads: readonly LeadSummary[];
};

const CARD = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const WRAP = "min-w-0 text-slate-800 [overflow-wrap:anywhere]";

/**
 * The lead list below `md` (C-48): one card per lead with the ten fields of the table. "View" is a large tap target
 * with the same accessible name as in the table, opening the detail without prefetch.
 */
export function LeadCards({ leads }: LeadCardsProps) {
  const t = useTranslations("OwnerLeads");
  return (
    <ul aria-label={t("list.caption")} className="space-y-3 md:hidden">
      {leads.map((lead, index) => {
        const row = toLeadRow(lead);
        return (
          <li key={row.id ?? `${row.code}-${index}`} className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 font-mono text-[13px] font-bold text-slate-900 [overflow-wrap:anywhere]">
                {row.code}
              </span>
              <LeadStatusBadge status={row.status} />
            </div>
            <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-slate-500">{t("list.columns.owner")}</dt>
              <dd className={WRAP}>{row.owner}</dd>
              <dt className="text-slate-500">{t("list.columns.ward")}</dt>
              <dd className={WRAP}>{row.ward}</dd>
              <dt className="text-slate-500">{t("list.columns.requirement")}</dt>
              <dd className={WRAP}>{row.requirementKey === null ? "" : t(row.requirementKey)}</dd>
              <dt className="text-slate-500">{t("list.columns.propertyType")}</dt>
              <dd className={WRAP}>{row.propertyTypeKey === null ? "" : t(row.propertyTypeKey)}</dd>
              <dt className="text-slate-500">{t("list.columns.created")}</dt>
              <dd className={WRAP}>{row.created}</dd>
              <dt className="text-slate-500">{t("list.columns.lastUpdate")}</dt>
              <dd className={WRAP}>{row.lastUpdate}</dd>
              <dt className="text-slate-500">{t("list.columns.note")}</dt>
              <dd className={WRAP}>
                {row.possibleDuplicate ? (
                  <Badge tone="warning">{t("list.possibleDuplicate")}</Badge>
                ) : (
                  <span className="text-slate-500">{t("list.noNote")}</span>
                )}
              </dd>
            </dl>
            {row.id !== undefined && (
              <Link
                href={leadDetailHref(row.id)}
                prefetch={false}
                aria-label={t("list.viewLabel", { code: row.code })}
                className="mt-3 flex min-h-11 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-sm font-semibold text-violet-700 hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
              >
                {t("list.view")}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
