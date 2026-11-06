"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { readOnlyNotice } from "../../lib/checklist/page-state";

import { useChecklistPage } from "./checklist-context";
import { TakeoverDialog } from "./takeover-dialog";

/**
 * Why the checklist has no inputs for this viewer (survey-checklist spec 6.4, W16-32), or, for the new assignee, the
 * takeover prompt with its dialog (W16-28). Nothing for an editor.
 */
export function ReadOnlyNotice() {
  const t = useTranslations("OwnerLeads");
  const { view, locks } = useChecklistPage();
  const [open, setOpen] = useState(false);
  const notice = readOnlyNotice(view);
  if (notice === null) return null;
  if (notice.kind === "reason") return <Alert tone="info">{t(notice.key)}</Alert>;
  return (
    <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
      <p className="text-sm font-medium text-slate-900">{t("checklist.takeover.prompt")}</p>
      <Button disabled={locks.all} onClick={() => setOpen(true)}>
        {t("checklist.takeover.button")}
      </Button>
      {open && <TakeoverDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
