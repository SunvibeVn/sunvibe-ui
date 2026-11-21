"use client";

import { useTranslations } from "next-intl";
import type { Ref } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import type { StopOutcome } from "../lib/suspension-flow";

type StopOutcomeNoticeProps = {
  /** The last answer of the dialog's command; null before the first. */
  outcome: StopOutcome | null;
  /** A 400 named a field the dialog does not hold: the failure line, since the reader cannot fix it. */
  otherFields: boolean;
  /** "Reload" after a change made at the same time: the page reads the agreement again. */
  onReload: () => void;
  /** The message, to take the focus after an answer. */
  ref?: Ref<HTMLDivElement>;
};

/**
 * The message a stop dialog keeps open (brokerage-agreement E05-S8, spec section 6, E05S8-P13): a change made at the
 * same time with "Reload"; an agreement no longer available; any other failure with its support code. Nothing for a
 * 204, the codes the page shows after its reread (403, other 409s) or the field errors, which sit on their fields.
 */
export function StopOutcomeNotice({ outcome, otherFields, onReload, ref }: StopOutcomeNoticeProps) {
  const t = useTranslations("BrokerageAgreement");

  let message = null;
  if (outcome?.kind === "concurrent") {
    message = (
      <Alert tone="error">
        <p>{t("stop.concurrent")}</p>
        <Button variant="secondary" className="mt-2 px-4 py-2" onClick={onReload}>
          {t("stop.reload")}
        </Button>
      </Alert>
    );
  } else if (outcome?.kind === "notFound") {
    message = (
      <Alert tone="error">
        <p>{t("stop.notFound")}</p>
      </Alert>
    );
  } else if (outcome?.kind === "failed" || (outcome?.kind === "fields" && otherFields)) {
    const correlationId = outcome.kind === "failed" ? outcome.correlationId : undefined;
    message = (
      <Alert tone="error">
        <p>{t("stop.failed")}</p>
        {correlationId !== undefined && <p className="mt-1 text-xs">{t("stop.supportCode", { code: correlationId })}</p>}
      </Alert>
    );
  }
  if (message === null) return null;
  return (
    <div ref={ref} tabIndex={-1} className="outline-none">
      {message}
    </div>
  );
}
