"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Alert } from "@/components/ui/alert";

import type { ConfirmationMessage as Message } from "../lib/confirmation-flow";

/** A refusal on the account page, with its support code (ADR-010); each new one takes focus, so it is seen and read out. */
export function ConfirmationMessage({ value }: { value: Message }) {
  const t = useTranslations("InventoryIntake");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
    ref.current?.focus({ preventScroll: true });
  }, [value]);
  return (
    <div ref={ref} tabIndex={-1} className="focus:outline-none">
      <Alert tone="error">
        <p>{t(value.key)}</p>
        {value.correlationId !== undefined && (
          <p className="mt-1 text-xs">{t("account.errors.supportCode", { correlationId: value.correlationId })}</p>
        )}
      </Alert>
    </div>
  );
}
