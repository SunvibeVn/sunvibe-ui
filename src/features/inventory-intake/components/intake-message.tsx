"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Alert } from "@/components/ui/alert";

import type { IntakeMessage as Message } from "../lib/intake-command";

type IntakeMessageProps = { value: Message; tone?: "error" | "success" };

/** The message of a command with its support code (ADR-010); each new one takes focus, so it is seen and read out. */
export function IntakeMessage({ value, tone = "error" }: IntakeMessageProps) {
  const t = useTranslations("InventoryIntake");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
    ref.current?.focus({ preventScroll: true });
  }, [value]);
  return (
    <div ref={ref} tabIndex={-1} className="focus:outline-none">
      <Alert tone={tone}>
        <p>{t(value.key)}</p>
        {value.correlationId !== undefined && (
          <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: value.correlationId })}</p>
        )}
      </Alert>
    </div>
  );
}
