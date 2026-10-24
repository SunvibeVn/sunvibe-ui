"use client";

import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui/alert";

import type { EarlierChecklist } from "../../lib/checklist/page-notices";
import { pageNotices } from "../../lib/checklist/page-notices";

/**
 * The banners of every checklist view (survey-checklist spec 6.2, section 8, US-2 AC-4) and, on a draft of a later
 * visit, the starts-empty banner (BR-23); there is no control that copies earlier values (A-22).
 */
export function PageBanners({ earlier, withLaterVisit = true }: { earlier: EarlierChecklist | null; withLaterVisit?: boolean }) {
  const t = useTranslations("OwnerLeads");
  const notices = pageNotices({ earlier });
  return (
    <div className="space-y-2">
      <Alert tone="info">{t("checklist.page.legal")}</Alert>
      <Alert tone="info">{t("checklist.page.media")}</Alert>
      {withLaterVisit && notices.laterVisit !== null && (
        <Alert tone="info">
          {t("checklist.page.laterVisit", { surveyNo: notices.laterVisit.surveyNo, checklistNo: notices.laterVisit.checklistNo })}
        </Alert>
      )}
    </div>
  );
}
