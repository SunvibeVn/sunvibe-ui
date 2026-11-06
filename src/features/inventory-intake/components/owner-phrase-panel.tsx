"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format/vietnam-time";

import type { PhraseState } from "../lib/owner-check-state";

/** The phrase, once, with the English meaning of the call script (U-6); the manager says the script in Vietnamese (T-5). */
export function OwnerPhrasePanel({ value, onDone }: { value: Extract<PhraseState, { kind: "shown" }>; onDone(): void }) {
  const t = useTranslations("InventoryIntake");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div ref={ref} tabIndex={-1} role="status" className="space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-4 focus:outline-none">
      <p className="text-sm font-semibold text-violet-900">{t("ownerCheckPanel.phraseTitle")}</p>
      <p className="font-mono text-2xl font-semibold tracking-widest break-all text-navy-950">
        {value.phrase}
      </p>
      {value.expiresAt !== null && <p className="text-sm text-violet-900">{t("ownerCheckPanel.phraseEnds", { date: formatDateTime(value.expiresAt) })}</p>}
      <p className="text-sm text-violet-900">{t("ownerCheckPanel.script")}</p>
      <p className="text-xs text-violet-900">{t("ownerCheckPanel.scriptNote")}</p>
      <Button variant="secondary" onClick={onDone}>
        {t("ownerCheckPanel.phraseDone")}
      </Button>
    </div>
  );
}
