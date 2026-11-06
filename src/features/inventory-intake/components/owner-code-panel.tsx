"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format/vietnam-time";

import type { OwnerCodeState } from "../lib/owner-code-state";

/** The code, once (U-2). It takes focus, because the Sale reads it out now and it does not come back. */
export function OwnerCodePanel({ value, onDone }: { value: Extract<OwnerCodeState, { kind: "shown" }>; onDone(): void }) {
  const t = useTranslations("InventoryIntake");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div ref={ref} tabIndex={-1} role="status" className="space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-4 focus:outline-none">
      <p className="text-sm font-semibold text-violet-900">{t("owner.codeTitle")}</p>
      <p className="font-mono text-2xl font-semibold tracking-widest break-all text-navy-950">
        {value.code}
      </p>
      <p className="text-sm text-violet-900">{t("owner.codeOnce")}</p>
      {value.expiresAt !== null && <p className="text-sm text-violet-900">{t("owner.codeEnds", { date: formatDateTime(value.expiresAt) })}</p>}
      <Button variant="secondary" onClick={onDone}>
        {t("owner.codeDone")}
      </Button>
    </div>
  );
}
