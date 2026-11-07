"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Alert } from "@/components/ui/alert";

import { statusBanner } from "../../lib/checklist/status-model";

import { useChecklistPage } from "./checklist-context";

/**
 * Where a revision stands (survey-checklist submission spec 6.1): submitted by whom and when, or the outcome with its
 * kind, reviewer and date. Nothing on a draft. When a command changes the status its button is gone, so focus lands here
 * instead of the page body.
 */
export function StatusBanner() {
  const t = useTranslations("OwnerLeads");
  const { view } = useChecklistPage();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(view.status);
  useEffect(() => {
    if (seen.current === view.status) return;
    seen.current = view.status;
    if (document.activeElement === null || document.activeElement === document.body) ref.current?.focus();
  }, [view.status]);
  const banner = statusBanner(view, t);
  if (banner === null) return null;
  return (
    <div ref={ref} tabIndex={-1} className="focus:outline-none">
      <Alert tone={banner.tone}>{banner.text}</Alert>
    </div>
  );
}
