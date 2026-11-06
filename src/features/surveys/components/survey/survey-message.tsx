"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Alert } from "@/components/ui/alert";

import type { SurveyErrorMessage } from "../../lib/survey/survey-failure";

import { errorKey } from "./survey-copy";

export type SurveyDialogMessage = { message: SurveyErrorMessage; correlationId?: string };

/**
 * The message of a failed survey command, with its support code (ADR-010). Drawn at the top of a dialog body that may
 * be scrolled down to Save: each new message scrolls into view and takes focus, so the user sees why nothing saved.
 */
export function SurveyMessage({ value }: { value: SurveyDialogMessage }) {
  const t = useTranslations("OwnerLeads");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
    ref.current?.focus({ preventScroll: true });
  }, [value]);
  return (
    <div ref={ref} tabIndex={-1} className="focus:outline-none">
      <Alert tone="error">
        <p>{t(errorKey(value.message))}</p>
        {value.correlationId !== undefined && (
          <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: value.correlationId })}</p>
        )}
      </Alert>
    </div>
  );
}
