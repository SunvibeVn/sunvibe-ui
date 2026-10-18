"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

import type { LeadSummary } from "../types";

import { LeadStatusBadge } from "./lead-status-badge";
import { useLeadRowViews } from "./lead-row";

type LeadTableProps = {
  leads: readonly LeadSummary[];
  /** "Tất cả" tab: adds the assignee column (US-3 AC-2). */
  showAssignee: boolean;
  now: Date;
};

const HEAD = "px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500";
const CELL = "px-3 py-3 align-top text-slate-800";

/** The lead list from `md` up. Rows link to the detail without prefetch; no phone, email or address (BR-7). */
export function LeadTable({ leads, showAssignee, now }: LeadTableProps) {
  const t = useTranslations("OwnerLeads");
  const view = useLeadRowViews(now);
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{t("list.caption")}</caption>
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th scope="col" className={HEAD}>{t("list.columns.requestCode")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.contactName")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.ward")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.intent")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.propertyType")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.status")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.createdAt")}</th>
            <th scope="col" className={HEAD}>{t("list.columns.nextAction")}</th>
            {showAssignee && <th scope="col" className={HEAD}>{t("list.columns.assignee")}</th>}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, index) => {
            const row = view(lead, index);
            return (
              <tr key={row.key} className="border-b border-slate-100 last:border-0">
                <td className={CELL}>
                  {row.href === undefined ? (
                    <span className="font-semibold">{row.requestCode}</span>
                  ) : (
                    <Link
                      href={row.href}
                      prefetch={false}
                      aria-label={row.openLabel}
                      className="inline-flex min-h-10 items-center font-semibold text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                    >
                      {row.requestCode}
                    </Link>
                  )}
                  {row.possibleDuplicate && (
                    <div className="mt-1">
                      <Badge tone="warning">{t("list.possibleDuplicate")}</Badge>
                    </div>
                  )}
                </td>
                <td className={CELL}>{row.contactName}</td>
                <td className={CELL}>{row.ward}</td>
                <td className={CELL}>{row.intent}</td>
                <td className={CELL}>{row.propertyType}</td>
                <td className={CELL}>
                  <LeadStatusBadge status={row.status} />
                </td>
                <td className={`${CELL} whitespace-nowrap`}>{row.createdAt}</td>
                <td className={`${CELL} whitespace-nowrap ${row.overdue ? "bg-rose-50 text-rose-800" : ""}`}>
                  {row.nextAction === "" ? (
                    <span className="text-slate-500">{t("list.noNextAction")}</span>
                  ) : (
                    row.nextAction
                  )}
                  {row.overdue && <span className="ml-1 text-xs font-semibold">({t("list.overdue")})</span>}
                </td>
                {showAssignee && <td className={CELL}>{row.assignee}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
