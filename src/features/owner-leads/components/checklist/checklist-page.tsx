"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ArrowLeftIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { todayInVietnam, vietnamDate } from "@/lib/format/vietnam-time";

import { contextOf } from "../../lib/checklist/correction-rule";
import { checklistHref, tabOf } from "../../lib/checklist/routes";

import { type ChecklistController, ChecklistProvider } from "./checklist-context";
import { ChecklistEdit } from "./checklist-edit";
import { ChecklistHeader } from "./checklist-header";
import { ChecklistPreview } from "./checklist-preview";
import { CheckpointView } from "./checkpoint-view";
import { PageBanners } from "./page-banners";
import { ReadOnlyNotice } from "./read-only-notice";
import { TakeoversList } from "./takeovers-list";
import { useChecklist } from "./use-checklist";
import { useLeaveGuard } from "./use-leave-guard";

const BACK =
  "inline-flex min-h-8 items-center gap-1.5 rounded-full bg-violet-600/90 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

function LeaveGuard({ userId, leadId, checklistId }: { userId: string; leadId: string; checklistId: string }) {
  const t = useTranslations("OwnerLeads");
  useLeaveGuard({ userId, leadId, checklistId }, t("checklist.page.leaveConfirm"));
  return null;
}

/**
 * The checklist page `/workspace/owner-leads/[leadId]/survey-checklists/[checklistId]` (survey-checklist spec 6.2,
 * A-16): read in the browser only; a `[leadId]` that is not the checklist's lead redirects to the right route. Header,
 * banners, the read-only reason or the takeover prompt, tabs Edit and Preview (in the URL), the takeovers with their
 * snapshots. English, Vietnam dates and times, one column below `md`.
 */
export function ChecklistPage({ leadId, checklistId }: { leadId: string; checklistId: string }) {
  const t = useTranslations("OwnerLeads");
  const router = useRouter();
  const tab = tabOf(useSearchParams().get("tab"));
  const page = useChecklist(leadId, checklistId);
  const [snapshot, setSnapshot] = useState<number | null>(null);
  const view = page.load.state === "ready" ? page.load.view : null;
  const viewLeadId = view?.leadId;

  // The URL's lead is not the checklist's: go to the right route (the page uses `ChecklistResponse.leadId`).
  useEffect(() => {
    if (viewLeadId && viewLeadId !== leadId) router.replace(checklistHref(viewLeadId, checklistId, tab));
  }, [viewLeadId, leadId, checklistId, tab, router]);

  const back = (
    <Link href={`/workspace/owner-leads/${encodeURIComponent(viewLeadId ?? leadId)}`} prefetch={false} className={BACK}>
      <ArrowLeftIcon size={16} />
      {t("checklist.page.backToLead")}
    </Link>
  );

  if (page.userId === null) return null;
  if (page.load.state === "loading") {
    return (
      <div className="space-y-4">
        {back}
        <div role="status" aria-busy="true" className="space-y-4">
          <span className="sr-only">{t("checklist.page.loading")}</span>
          {[0, 1, 2].map((block) => (
            <div key={block} aria-hidden className="h-32 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }
  if (page.load.state === "error") {
    const { error } = page.load;
    return (
      <div className="space-y-4">
        {back}
        <Alert tone="error">
          <p>{error.kind === "forbidden" ? t("checklist.errors.forbidden") : t("checklist.page.loadFailed")}</p>
          {error.correlationId !== undefined && (
            <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: error.correlationId })}</p>
          )}
        </Alert>
        <Button variant="secondary" onClick={() => void page.reload()}>
          {t("errors.retry")}
        </Button>
      </div>
    );
  }

  const loaded = page.load.view;
  const controller: ChecklistController = {
    userId: page.userId,
    leadId: loaded.leadId ?? leadId,
    checklistId,
    view: loaded,
    ctx: contextOf(loaded),
    rules: {
      today: todayInVietnam(),
      arrivalDate: loaded.visit?.arrivedAt ? vietnamDate(loaded.visit.arrivedAt) : "",
      viewerUserId: page.userId,
    },
    locks: page.locks,
    earlier: page.earlier,
    notKept: page.notKept,
    clearNotKept: page.clearNotKept,
    message: page.message,
    save: page.save,
    takeOver: page.takeOver,
    fail: page.fail,
    reload: page.reload,
  };

  return (
    <ChecklistProvider value={controller}>
      <LeaveGuard userId={controller.userId} leadId={controller.leadId} checklistId={checklistId} />
      <div className="space-y-4">
        {back}
        <ChecklistHeader />
        {snapshot !== null ? (
          <CheckpointView takeoverNo={snapshot} onClose={() => setSnapshot(null)} />
        ) : (
          <>
            <PageBanners earlier={page.earlier} />
            {page.message !== null && (
              <div aria-live="polite">
                <Alert tone="error">{t(`checklist.errors.${page.message}`)}</Alert>
              </div>
            )}
            <ReadOnlyNotice />
            <Tabs
              label={t("checklist.page.tabs.label")}
              items={[
                { href: checklistHref(controller.leadId, checklistId, "edit"), label: t("checklist.page.tabs.edit"), current: tab === "edit" },
                {
                  href: checklistHref(controller.leadId, checklistId, "preview"),
                  label: t("checklist.page.tabs.preview"),
                  current: tab === "preview",
                },
              ]}
            />
            {tab === "edit" ? <ChecklistEdit /> : <ChecklistPreview />}
            <TakeoversList onViewSnapshot={setSnapshot} />
          </>
        )}
      </div>
    </ChecklistProvider>
  );
}
