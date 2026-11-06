"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useState } from "react";

import { ArrowLeftIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { todayInVietnam, vietnamDate } from "@/lib/format/vietnam-time";

import { contextOf } from "../../../surveys/lib/checklist/correction-rule";
import {
  EMPTY_REVIEW_FORM,
  hasReviewInput,
  heldReviewForm,
  type HeldReviewForm,
  reviewAccess,
} from "../../../surveys/lib/checklist/review-model";
import { checklistHref, tabOf } from "../../../surveys/lib/checklist/routes";

import { type ChecklistController, ChecklistProvider } from "./checklist-context";
import { ChecklistEdit } from "./checklist-edit";
import { ChecklistHeader } from "./checklist-header";
import { ChecklistPreview } from "./checklist-preview";
import { CheckpointView } from "./checkpoint-view";
import { DecisionPanel } from "./decision-panel";
import { PageBanners } from "./page-banners";
import { useChecklistMedia } from "./media-context";
import { ChecklistMediaScope } from "./media-scope";
import { ReadOnlyNotice } from "./read-only-notice";
import { ReviewTab } from "./review-tab";
import { StatusBanner } from "./status-banner";
import { TakeoversList } from "./takeovers-list";
import { useChecklist } from "./use-checklist";
import { useRevisionChain } from "./use-revision-chain";
import { useLeaveGuard } from "./use-leave-guard";

const BACK =
  "inline-flex min-h-8 items-center gap-1.5 rounded-full bg-violet-600/90 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

type LeaveGuardProps = {
  userId: string;
  leadId: string;
  checklistId: string;
  /** A review typed and not sent: it lives in page memory only, so leaving drops it. */
  reviewTyped: boolean;
};

function LeaveGuard({ userId, leadId, checklistId, reviewTyped }: LeaveGuardProps) {
  const t = useTranslations("OwnerLeads");
  const media = useChecklistMedia();
  const uploading = media?.uploading === true;
  useLeaveGuard({ userId, leadId, checklistId }, t("checklist.page.leaveConfirm"), {
    running: uploading || reviewTyped,
    confirmText: t(uploading ? "checklist.media.leaveUploading" : "checklist.review.leaveConfirm"),
  });
  return null;
}

/**
 * The checklist page `/workspace/owner-leads/[leadId]/survey-checklists/[checklistId]` (survey-checklist spec 6.2,
 * A-16): read in the browser only; a `[leadId]` that is not the checklist's lead redirects to the right route. Header,
 * banners, the status and decision of the revision, the read-only reason or the takeover prompt, tabs Edit, Preview and
 * for a reviewer Review (in the URL), the takeovers with their snapshots. English, Vietnam dates and times, one column
 * below `md`.
 */
export function ChecklistPage({ leadId, checklistId }: { leadId: string; checklistId: string }) {
  const t = useTranslations("OwnerLeads");
  const router = useRouter();
  const tab = tabOf(useSearchParams().get("tab"));
  const page = useChecklist(leadId, checklistId);
  const [snapshot, setSnapshot] = useState<number | null>(null);
  // The review form outlives a switch of tab, but belongs to one user and revision and to page memory only (`survey BR-4`).
  const reviewKey = `${page.userId}:${checklistId}`;
  const [review, setReview] = useState<HeldReviewForm>({ key: reviewKey, form: EMPTY_REVIEW_FORM });
  const reviewForm = review.key === reviewKey ? review.form : EMPTY_REVIEW_FORM;
  const view = page.load.state === "ready" ? page.load.view : null;
  const reviewShown = view !== null && tab === "review" && reviewAccess(view, reviewForm) === "open";
  const { chain, retry: retryChain } = useRevisionChain({
    userId: page.userId,
    firstId: view?.previousChecklistId ?? null,
    enabled: reviewShown,
  });
  const viewLeadId = view?.leadId;

  // The URL's lead is not the checklist's: go to the right route (the page uses `ChecklistResponse.leadId`).
  useEffect(() => {
    if (viewLeadId && viewLeadId !== leadId) router.replace(checklistHref(viewLeadId, checklistId, tab));
  }, [viewLeadId, leadId, checklistId, tab, router]);

  // Next keeps this route hidden (Activity) after navigating away: nothing typed for the review stays behind it.
  useLayoutEffect(() => () => setReview((held) => ({ ...held, form: EMPTY_REVIEW_FORM })), []);

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
  const canReview = reviewAccess(loaded, reviewForm) !== "hidden";
  // A review URL for a viewer without the tab, or after the decision, opens Edit.
  const shownTab = tab === "review" && !canReview ? "edit" : tab;
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
    submit: page.submit,
    decide: page.decide,
    fail: page.fail,
    reload: page.reload,
    accessLost: page.accessLost,
  };

  return (
    <ChecklistProvider value={controller}>
      <ChecklistMediaScope>
        <LeaveGuard userId={controller.userId} leadId={controller.leadId} checklistId={checklistId} reviewTyped={hasReviewInput(reviewForm)} />
        <div className="space-y-4">
          {back}
          <ChecklistHeader />
          {snapshot !== null ? (
            <CheckpointView takeoverNo={snapshot} onClose={() => setSnapshot(null)} />
          ) : (
            <>
              <PageBanners earlier={page.earlier} view={loaded} />
              <StatusBanner />
              <DecisionPanel />
              {page.message !== null && (
                <div aria-live="polite">
                  <Alert tone={page.message === "alreadyDecided" ? "info" : "error"}>{t(`checklist.errors.${page.message}`)}</Alert>
                </div>
              )}
              <ReadOnlyNotice />
              <Tabs
                label={t("checklist.page.tabs.label")}
                items={[
                  { href: checklistHref(controller.leadId, checklistId, "edit"), label: t("checklist.page.tabs.edit"), current: shownTab === "edit" },
                  {
                    href: checklistHref(controller.leadId, checklistId, "preview"),
                    label: t("checklist.page.tabs.preview"),
                    current: shownTab === "preview",
                  },
                  ...(canReview
                    ? [
                        {
                          href: checklistHref(controller.leadId, checklistId, "review"),
                          label: t("checklist.page.tabs.review"),
                          current: shownTab === "review",
                        },
                      ]
                    : []),
                ]}
              />
              {shownTab === "edit" && <ChecklistEdit />}
              {shownTab === "preview" && <ChecklistPreview />}
              {shownTab === "review" && (
                <ReviewTab
                  form={reviewForm}
                  onChange={(update) => setReview((held) => heldReviewForm(held, reviewKey, update))}
                  chain={chain}
                  onRetryChain={retryChain}
                />
              )}
              <TakeoversList onViewSnapshot={setSnapshot} />
            </>
          )}
        </div>
      </ChecklistMediaScope>
    </ChecklistProvider>
  );
}
