"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";

import { formatDateTime } from "../lib/format";
import { isClosedLeadStatus } from "../types";

import { LeadActionsSlot } from "./lead-actions-slot";
import { useLeadDetail } from "./lead-detail-context";
import { LeadStatusBadge } from "./lead-status-badge";
import { assigneeListHref, leadDetailHref } from "./list-href";

const LINK =
  "font-medium text-violet-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

/**
 * The lead block of the detail (US-4, US-7), the region "Lead": request code (the page h1), status, assignee, created
 * time and the assign button on one row, and the closed banner. No next action and no status button: the status
 * changes in the history (owner 2026-10-23, D-2). A `<section>`, not a `<header>`: inside `main` a header is no
 * landmark, while the labelled section is the "Lead" region.
 */
export function LeadDetailHeader() {
  const t = useTranslations("OwnerLeads");
  const { lead, viewer } = useLeadDetail();
  const status = lead.status;
  const closed = isClosedLeadStatus(status);

  const assigneeName = lead.assignedUserName?.trim() ? lead.assignedUserName : null;
  const assigneeId = lead.assignedUserId;
  // An `ALL` viewer follows the assignee to "All Leads" filtered by that person (C-34). Built like every list link, so
  // the viewer's tabs and the URL rules apply.
  const assigneeHref = viewer.access === "ALL" && assigneeId ? assigneeListHref(assigneeId, viewer) : undefined;
  const assigneeText = assigneeName ?? (assigneeId ? t("history.actorUnknown") : t("detail.unassigned"));

  const createdAt = lead.createdAt === undefined ? "" : formatDateTime(lead.createdAt);
  const reason = lead.closeReason?.trim();

  return (
    <section
      aria-label={t("detail.title")}
      className="h-full space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div>
        <p className="text-sm text-slate-500">{t("detail.title")}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{lead.requestCode ?? ""}</h1>
          <LeadStatusBadge status={status} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <dl className="grid flex-1 gap-3 text-sm sm:grid-cols-2">
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
            <dt className="text-slate-500">{t("detail.createdAt")}</dt>
            <dd className="mt-0.5 whitespace-nowrap text-slate-900">{createdAt}</dd>
          </div>
        </dl>
        <LeadActionsSlot />
      </div>

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
    </section>
  );
}
