"use client";

import { useTranslations } from "next-intl";

import { caseGateKey } from "../lib/case-gate-view";

import { useIntake } from "./intake-context";
import { StepCard } from "./step-card";

/** What a Sale reads while a case holds the intake (U-6): one fixed sentence, and no owner data. */
export function CaseGate() {
  const t = useTranslations("InventoryIntake");
  const { block } = useIntake();
  const key = caseGateKey(block);
  if (key === null) return null;
  return (
    <StepCard title={t("caseGate.title")}>
      <p className="text-sm text-slate-700">{t(key)}</p>
    </StepCard>
  );
}
