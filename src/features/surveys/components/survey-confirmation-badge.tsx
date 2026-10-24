"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

import { confirmationLabel } from "../lib/confirmation-label";
import type { SurveyListItem } from "../types";

/** The confirmation of a listed appointment: green only for "Owner confirmed" (US-1 AC-3). */
export function SurveyConfirmationBadge({ confirmation }: { confirmation: NonNullable<SurveyListItem>["confirmation"] }) {
  const t = useTranslations("Surveys");
  const label = confirmationLabel(confirmation);
  switch (label.key) {
    case "confirmed":
      return <Badge tone="success" wrap>{t("confirmation.confirmed")}</Badge>;
    case "notConfirmed":
      return <Badge tone="warning" wrap>{t("confirmation.notConfirmed")}</Badge>;
    case "needsReconfirmation":
      return (
        <Badge tone="warning" wrap>
          {label.causeKey === undefined
            ? t("confirmation.needsReconfirmation")
            : t("confirmation.withCause", { cause: t(`confirmation.cause.${label.causeKey}`) })}
        </Badge>
      );
  }
}
