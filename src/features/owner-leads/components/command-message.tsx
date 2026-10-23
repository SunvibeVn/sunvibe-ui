"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { ForbiddenNotice } from "@/features/auth/client";

import type { CommandMessage } from "../lib/command-flow";
import { statusLabelKey } from "../lib/labels";

/**
 * Shows a command message (spec 5.2): stale, refused transition with the allowed statuses, ineligible assignee, 400
 * without a known field, retry cases, the forbidden notice, or the success line; the support code in small text.
 */
export function CommandMessageView({ message }: { message: CommandMessage }) {
  const t = useTranslations("OwnerLeads");
  if (message.kind === "assigned") return <Alert tone="success">{t("assignDialog.saved")}</Alert>;

  const correlationId = "correlationId" in message ? message.correlationId : undefined;
  const support =
    correlationId !== undefined ? (
      <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId })}</p>
    ) : null;

  if (message.kind === "forbidden") {
    return (
      <div>
        <ForbiddenNotice />
        {support !== null && <div className="px-4 text-rose-800">{support}</div>}
      </div>
    );
  }

  let text: string;
  let extra: string | null = null;
  switch (message.kind) {
    case "stale":
      text = t("errors.concurrent");
      break;
    case "invalid-transition":
      text = t("errors.invalidTransition");
      if (message.allowed !== undefined && message.allowed.length > 0) {
        extra = t("statusDialog.allowedValues", {
          values: message.allowed.map((status) => t(statusLabelKey(status))).join(", "),
        });
      }
      break;
    case "ineligible":
      text = t("errors.ineligibleAssignee");
      break;
    case "bad-request":
      text = t("errors.badRequest");
      break;
    case "failed":
      text = t("errors.generic");
      break;
  }

  return (
    <Alert tone="error">
      <p>{text}</p>
      {extra !== null && <p className="mt-1">{extra}</p>}
      {support}
    </Alert>
  );
}
