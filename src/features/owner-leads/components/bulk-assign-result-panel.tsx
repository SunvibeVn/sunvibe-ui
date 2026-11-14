"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";

import type { BulkAssignModel } from "../lib/bulk-assign-model";

type BulkAssignResultPanelProps = {
  model: BulkAssignModel;
  onDismiss(): void;
};

/**
 * The result of one bulk assignment (acquisition-owner-lead-bulk-assign AC-21, D-10): the three totals, one line per
 * lead with its request code and outcome, and the retry hint when a lead was not assigned. Never a phone, email,
 * address or name. It takes the focus when it shows, since the button that opened the dialog leaves with the reload.
 */
export function BulkAssignResultPanel({ model, onDismiss }: BulkAssignResultPanelProps) {
  const t = useTranslations("OwnerLeads");
  const titleId = useId();
  const region = useRef<HTMLElement>(null);
  const focused = useRef(false);

  // Once: the effect runs again when a route Next kept hidden is shown again, and must not take the focus then.
  useEffect(() => {
    if (focused.current) return;
    focused.current = true;
    region.current?.focus();
  }, []);

  return (
    <section
      ref={region}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950 shadow-sm focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="font-semibold">
          {t("bulkAssign.resultTitle")}
        </h2>
        <Button variant="ghost" onClick={onDismiss}>
          {t("notice.dismiss")}
        </Button>
      </div>
      <p>{t("bulkAssign.totals", model.totals)}</p>
      <ul className="mt-2 space-y-1">
        {model.lines.map((line) => (
          <li key={line.leadId} className="flex flex-wrap gap-x-2">
            <span className="font-mono text-[13px] font-bold [overflow-wrap:anywhere]">{line.code}</span>{" "}
            <span className="min-w-0">{t(`bulkAssign.outcome.${line.outcome}`)}</span>
          </li>
        ))}
      </ul>
      {model.showRetryHint && <p className="mt-2 text-violet-900">{t("bulkAssign.retryHint")}</p>}
    </section>
  );
}
