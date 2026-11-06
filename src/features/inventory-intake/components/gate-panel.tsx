"use client";

import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/alert";

import { GATE_REASON_LABEL, labelOf } from "../lib/labels";

import { useIntake } from "./intake-context";

/** The gate and its reasons (U-1): nothing here, and nothing else on the page, offers a way past them. */
export function GatePanel() {
  const t = useTranslations("InventoryIntake");
  const { block } = useIntake();
  const code = block.earlierResult?.propertyCode;
  const reasons = (block.gate?.reasons ?? []).flatMap((reason) => labelOf(GATE_REASON_LABEL, reason) ?? []);
  const closed = block.gate?.ready !== true && block.status !== "COMPLETED";

  return (
    <>
      {closed && (
        <Alert tone="error" title={t("gatePanel.closedTitle")}>
          <ul className="list-disc space-y-0.5 pl-4">
            {reasons.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </Alert>
      )}
      {code && <Alert>{t("gatePanel.earlier", { code })}</Alert>}
    </>
  );
}
