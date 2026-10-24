"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { confirmationLabel, type SurveyConfirmation } from "@/features/surveys";

/**
 * The owner confirmation of an appointment as a badge (US-1 AC-3, spec 6.6): green only for "Owner confirmed"; an
 * unconfirmed appointment never reads as agreed.
 */
export function ConfirmationBadge({ confirmation }: { confirmation: SurveyConfirmation | null | undefined }) {
  const t = useTranslations("OwnerLeads");
  const label = confirmationLabel(confirmation);
  switch (label.key) {
    case "confirmed":
      return <Badge tone="success" wrap>{t("survey.confirmation.confirmed")}</Badge>;
    case "notConfirmed":
      return <Badge tone="warning" wrap>{t("survey.confirmation.notConfirmed")}</Badge>;
    case "needsReconfirmation":
      return (
        <Badge tone="warning" wrap>
          {label.causeKey === undefined
            ? t("survey.confirmation.needsReconfirmation")
            : t("survey.confirmation.withCause", { cause: t(`survey.confirmation.cause.${label.causeKey}`) })}
        </Badge>
      );
  }
}
