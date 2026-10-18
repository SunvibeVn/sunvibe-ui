"use client";

import { useTranslations } from "next-intl";

import { assigneeOption } from "../lib/assignee-option";
import type { EligibleAssignee } from "../types";

/**
 * The text of an assignee option, "<tên> · <vai trò>" (C-29), from `assigneeOption`: the lead filter, the assign
 * dialog and the territory dialog (through `AssigneePicker`) all use it. A missing name shows "Không rõ".
 */
export function useAssigneeOptionLabel(): (assignee: EligibleAssignee) => string {
  const t = useTranslations("OwnerLeads");
  return (assignee) => {
    const { name, roleKey } = assigneeOption(assignee);
    return t("assignDialog.assigneeOption", { name: name ?? t("history.actorUnknown"), role: t(roleKey) });
  };
}
