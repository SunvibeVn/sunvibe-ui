"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";

import { formatDateTime } from "../lib/format";
import { isOverdue } from "../lib/overdue";
import { isClosedLeadStatus, isLeadStatus } from "../types";

import { LeadActionsSlot } from "./lead-actions-slot";
import { useLeadDetail } from "./lead-detail-context";
import { LeadStatusBadge } from "./lead-status-badge";
import { assigneeListHref, leadDetailHref } from "./list-href";

const LINK =
  "font-medium text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

/** Request code, status, assignee, next action, closed banner and the place for the action buttons (US-4, US-6, US-7). */
export function LeadDetailHeader() {
  const t = useTranslations("OwnerLeads");
  const { lead, viewer, now } = useLeadDetail();
  const status = lead.status;
  const closed = isClosedLeadStatus(status);
  const overdue = isLeadStatus(status) && isOverdue({ status, nextActionAt: lead.nextActionAt }, now);

  const assigneeName = lead.assignedUserName?.trim() ? lead.assignedUserName : null;
  const assigneeId = lead.assignedUserId;
  // An `ALL` viewer follows the assignee to "All Leads" filtered by that person (C-34). Built like every list link, so
  // the viewer's tabs and the URL rules apply.
  const assigneeHref = viewer.access === "ALL" && assigneeId ? assigneeListHref(assigneeId, viewer) : undefined;
  const assigneeText = assigneeName ?? (assigneeId ? t("history.actorUnknown") : t("detail.unassigned"));

  const nextAction = lead.nextActionAt === undefined ? "" : formatDateTime(lead.nextActionAt);
  const createdAt = lead.createdAt === undefined ? "" : formatDateTime(lead.createdAt);
  const reason = lead.closeReason?.trim();

  return (
    <header className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div>
        <p className="text-sm text-slate-500">{t("detail.title")}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{lead.requestCode ?? ""}</h1>
          <LeadStatusBadge status={status} />
        </div>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">{t("detail.assignee")}</dt>
          <dd className="mt-0.5 text-slate-900">
            {assigneeHref !== undefined ? (
              <Link
                href={assigneeHref}
                prefetch={false}
                aria-label={assigneeName === null ? undefined : t("detail.filterByAssignee", { name: assigneeName })}
                className={LINK}
              >
                {assigneeText}
              </Link>
            ) : (
              assigneeText
            )}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">{t("detail.nextAction")}</dt>
          <dd className={`mt-0.5 ${overdue ? "inline-block rounded bg-rose-50 px-1.5 py-0.5 text-rose-800" : "text-slate-900"}`}>
            {nextAction === "" ? <span className="text-slate-500">{t("detail.noNextAction")}</span> : nextAction}
            {overdue && <span className="ml-1 text-xs font-semibold">({t("detail.overdue")})</span>}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">{t("detail.createdAt")}</dt>
          <dd className="mt-0.5 text-slate-900">{createdAt}</dd>
        </div>
      </dl>

      {closed && (
        <Alert tone="info" title={t("detail.closedBanner")}>
          {reason && (
            <p>
              <span className="font-medium">{t("detail.closeReason")}:</span>{" "}
              <span className="whitespace-pre-wrap break-words">{lead.closeReason}</span>
            </p>
          )}
          {lead.duplicateOfLeadId && (
            <p className={reason ? "mt-1" : undefined}>
              <span className="font-medium">{t("detail.originalLead")}:</span>{" "}
              <Link href={leadDetailHref(lead.duplicateOfLeadId)} prefetch={false} className={LINK}>
                {t("detail.openOriginal")}
              </Link>
            </p>
          )}
        </Alert>
      )}

      <LeadActionsSlot />
    </header>
  );
}
