"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

import type { LeadSummary } from "../types";

import { LeadStatusBadge } from "./lead-status-badge";
import { type LeadRowView, useLeadRowViews } from "./lead-row";

type LeadCardsProps = {
  leads: readonly LeadSummary[];
  showAssignee: boolean;
  now: Date;
};

const CARD =
  "block min-h-14 rounded-xl border border-slate-200 bg-white p-4 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

function CardBody({ row, showAssignee }: { row: LeadRowView; showAssignee: boolean }) {
  const t = useTranslations("OwnerLeads");
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-words font-semibold text-violet-700 [overflow-wrap:anywhere]">{row.requestCode}</span>
        <LeadStatusBadge status={row.status} />
      </div>
      {row.possibleDuplicate && (
        <div className="mt-2">
          <Badge tone="warning">{t("list.possibleDuplicate")}</Badge>
        </div>
      )}
      <p className="mt-2 min-w-0 text-sm font-medium text-slate-900 [overflow-wrap:anywhere]">{row.contactName}</p>
      <p className="min-w-0 text-sm text-slate-600 [overflow-wrap:anywhere]">
        {[row.ward, row.intent, row.propertyType].filter((part) => part !== "").join(" · ")}
      </p>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">{t("list.columns.createdAt")}</dt>
        <dd className="min-w-0 text-slate-800 [overflow-wrap:anywhere]">{row.createdAt}</dd>
        <dt className="text-slate-500">{t("list.columns.nextAction")}</dt>
        <dd className={row.overdue ? "min-w-0 rounded bg-rose-50 px-1 text-rose-800 [overflow-wrap:anywhere]" : "min-w-0 text-slate-800 [overflow-wrap:anywhere]"}>
          {row.nextAction === "" ? t("list.noNextAction") : row.nextAction}
          {row.overdue && <span className="ml-1 text-xs font-semibold">({t("list.overdue")})</span>}
        </dd>
        {showAssignee && (
          <>
            <dt className="text-slate-500">{t("list.columns.assignee")}</dt>
            <dd className="min-w-0 text-slate-800 [overflow-wrap:anywhere]">{row.assignee}</dd>
          </>
        )}
      </dl>
    </>
  );
}

/** The lead list below `md`: one card per lead, the whole card is the link to the detail (no prefetch). */
export function LeadCards({ leads, showAssignee, now }: LeadCardsProps) {
  const t = useTranslations("OwnerLeads");
  const view = useLeadRowViews(now);
  return (
    <ul aria-label={t("list.caption")} className="space-y-3 md:hidden">
      {leads.map((lead, index) => {
        const row = view(lead, index);
        return (
          <li key={row.key}>
            {row.href === undefined ? (
              <div className={CARD}>
                <CardBody row={row} showAssignee={showAssignee} />
              </div>
            ) : (
              <Link href={row.href} prefetch={false} className={CARD}>
                <CardBody row={row} showAssignee={showAssignee} />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
