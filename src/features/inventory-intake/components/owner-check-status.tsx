"use client";

import { useTranslations } from "next-intl";

import { useIntake } from "./intake-context";
import { StepCard } from "./step-card";

/** Where the manager's check stands; the assignee sees this and nothing of the check itself (D5-7). */
export function OwnerCheckStatus() {
  const t = useTranslations("InventoryIntake");
  const { block } = useIntake();
  return (
    <StepCard title={t("ownerCheck.title")}>
      <p className="text-sm text-slate-700">{t(`ownerCheck.${block.ownerCheck ?? "NONE"}`)}</p>
    </StepCard>
  );
}
