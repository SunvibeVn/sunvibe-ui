"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

type BulkAssignPanelProps = {
  /** The select-all box: every selectable row of the page selected, some of them, or none. */
  check: "checked" | "mixed" | "unchecked";
  count: number;
  /** True while a bulk assignment runs: every control is disabled (acquisition-owner-lead-bulk-assign D-12). */
  busy: boolean;
  onToggleAll(): void;
  onAssign(): void;
  onClear(): void;
};

/**
 * The selection panel above the list on "All Leads" (acquisition-owner-lead-bulk-assign D-7, AC-15): select-all for the
 * open leads of this page, and with a selection its count, "Assign selected" and "Clear selection". Outside the filter
 * bar, whose boxes stay the only status boxes. Wraps on a narrow screen.
 */
export function BulkAssignPanel({ check, count, busy, onToggleAll, onAssign, onClear }: BulkAssignPanelProps) {
  const t = useTranslations("OwnerLeads");
  const box = useRef<HTMLInputElement>(null);

  // The mixed state of a box can only be set through its element (as the filter bar's closed box does).
  useEffect(() => {
    if (box.current) box.current.indeterminate = check === "mixed";
  }, [check]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
      <label className="inline-flex min-h-10 min-w-0 cursor-pointer items-center gap-2 text-sm font-medium text-slate-800 has-[:disabled]:cursor-not-allowed">
        <input
          ref={box}
          type="checkbox"
          checked={check === "checked"}
          disabled={busy}
          onChange={onToggleAll}
          className="h-4 w-4 shrink-0 accent-violet-600"
        />
        <span className="min-w-0">{t("bulkAssign.selectAll")}</span>
      </label>
      {count > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm text-slate-600">{t("bulkAssign.selected", { count })}</span>
          <Button disabled={busy} onClick={onAssign}>
            {t("bulkAssign.assign")}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onClear}>
            {t("bulkAssign.clear")}
          </Button>
        </div>
      )}
    </div>
  );
}
