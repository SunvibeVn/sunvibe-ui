import { isOpenStatus, type LeadStatus } from "../types";

/**
 * C-20: an open lead whose next action is in the past is shown in light red. Closed leads, leads without a next action
 * and unreadable dates are never overdue. The exact instant is not overdue yet.
 */
export function isOverdue(lead: { status: LeadStatus; nextActionAt?: string | null }, now: Date): boolean {
  if (!isOpenStatus(lead.status) || !lead.nextActionAt) return false;
  const due = Date.parse(lead.nextActionAt);
  return Number.isFinite(due) && due < now.getTime();
}
