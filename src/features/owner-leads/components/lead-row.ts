"use client";

import { useTranslations } from "next-intl";

import { formatDateTime } from "../lib/format";
import { intentLabelKey, type OwnerLeadsKey, propertyTypeLabelKey } from "../lib/labels";
import { isOverdue } from "../lib/overdue";
import { isLeadStatus, type LeadSummary } from "../types";

import { leadDetailHref } from "./list-href";

/** The text of one list row, shared by the table and the cards. Never holds phone, email or address (BR-7). */
export type LeadRowView = {
  key: string;
  /** Detail route; undefined when the API sent no id. */
  href?: string;
  requestCode: string;
  contactName: string;
  ward: string;
  intent: string;
  propertyType: string;
  status: string | undefined;
  createdAt: string;
  /** "" when no next action is set. */
  nextAction: string;
  /** Open lead whose next action is in the past (C-20). */
  overdue: boolean;
  possibleDuplicate: boolean;
  assignee: string;
  openLabel: string;
};

/** "Chưa giao" only for a lead nobody holds; a holder without a name is "Không rõ", as in the history. */
function assigneeText(lead: LeadSummary, t: (key: "list.unassigned" | "history.actorUnknown") => string): string {
  if (lead.assignedUserName?.trim()) return lead.assignedUserName;
  return lead.assignedUserId ? t("history.actorUnknown") : t("list.unassigned");
}

/** The text of an optional label (`null` = the lead has none): "" instead of a missing translation. */
function optionalLabel(t: (key: OwnerLeadsKey) => string, key: OwnerLeadsKey | null): string {
  return key === null ? "" : t(key);
}

/** Builds `LeadRowView`s with the Vietnamese texts; `now` decides which next actions are overdue. */
export function useLeadRowViews(now: Date): (lead: LeadSummary, index: number) => LeadRowView {
  const t = useTranslations("OwnerLeads");
  return (lead, index) => {
    const requestCode = lead.requestCode ?? "";
    const status = lead.status;
    return {
      key: lead.id ?? `${requestCode}-${index}`,
      href: lead.id === undefined ? undefined : leadDetailHref(lead.id),
      requestCode,
      contactName: lead.contactName ?? "",
      ward: lead.wardName ?? "",
      intent: optionalLabel(t, intentLabelKey(lead.intent)),
      propertyType: optionalLabel(t, propertyTypeLabelKey(lead.propertyType)),
      status,
      createdAt: lead.createdAt === undefined ? "" : formatDateTime(lead.createdAt),
      nextAction: lead.nextActionAt === undefined ? "" : formatDateTime(lead.nextActionAt),
      overdue: isLeadStatus(status) && isOverdue({ status, nextActionAt: lead.nextActionAt }, now),
      possibleDuplicate: lead.possibleDuplicate === true,
      assignee: assigneeText(lead, t),
      openLabel: t("list.open", { code: requestCode }),
    };
  };
}
