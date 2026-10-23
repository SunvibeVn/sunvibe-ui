"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ForbiddenNotice, useSession } from "@/features/auth/client";

import { detailFailureAction } from "../lib/detail-failure";
import { mergeNoteResult, mergeSummary } from "../lib/detail-merge";
import { lastListUrl, listFlash } from "../lib/drafts";
import { type LeadUiError, toLeadUiError } from "../lib/lead-ui-error";
import { viewerOf } from "../lib/viewer";
import { getLead } from "../services/owner-leads-api";
import type { LeadDetail, LeadNoteResult, LeadSummary } from "../types";

import { LeadAsset } from "./lead-asset";
import { LeadContact } from "./lead-contact";
import { LeadDetailHeader } from "./lead-detail-header";
import { type CommandSource, type LeadDetailController, LeadDetailProvider } from "./lead-detail-context";
import { LeadDuplicates } from "./lead-duplicates";
import { LeadHistory } from "./lead-history";
import { LIST_PATH } from "./list-href";

/** A detail answer, for one user and one lead. */
type Loaded = { userId: string; leadId: string; lead: LeadDetail };
type Problem = { userId: string; leadId: string; error: LeadUiError };

const NO_ITEMS: readonly never[] = [];

function DetailSkeleton() {
  const t = useTranslations("OwnerLeads");
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">{t("detail.loading")}</span>
      {[0, 1, 2].map((block) => (
        <div key={block} aria-hidden className="h-32 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      ))}
    </div>
  );
}

function LoadProblem({ error, onRetry }: { error: LeadUiError; onRetry: () => void }) {
  const t = useTranslations("OwnerLeads");
  return (
    <div className="space-y-3">
      <Alert tone="error">
        <p>{t("errors.loadFailed")}</p>
        {error.correlationId !== undefined && (
          <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: error.correlationId })}</p>
        )}
      </Alert>
      <Button variant="secondary" onClick={onRetry}>
        {t("errors.retry")}
      </Button>
    </div>
  );
}

/**
 * The staff lead detail (spec 5.4). Read in the browser only, one `GET` per open of the page (C-36): the effect runs
 * again when the route is shown after being hidden (Activity) and an answer for another user, another lead, a hidden
 * page or an older call is dropped. A 404 goes back to the list with a one-shot notice (C-37); a 403 shows the
 * forbidden notice in place, without lead data (spec 5.2). "Back to leads" returns to the list URL this user last
 * saw in this tab (CR-10). The parts below get the lead and the commands through `useLeadDetail()`.
 */
export function LeadDetailView({ leadId }: { leadId: string }) {
  const t = useTranslations("OwnerLeads");
  const { user } = useSession();
  const router = useRouter();
  const userId = user?.userId ?? null;
  const roles = user?.roles;
  const viewer = useMemo(() => viewerOf(roles ?? []), [roles]);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  /** The parts with a command on its way (CR-2: one command at a time on the page). */
  const [busySources, setBusySources] = useState<readonly CommandSource[]>([]);
  const setBusy = useCallback((source: CommandSource, isBusy: boolean) => {
    setBusySources((prev) =>
      isBusy ? (prev.includes(source) ? prev : [...prev, source]) : prev.filter((item) => item !== source),
    );
  }, []);
  /** The user and lead the page is showing now; null while the route is hidden. Answers for anything else are dropped. */
  const live = useRef<{ userId: string; leadId: string } | null>(null);
  /** Number of the newest load; an older answer is dropped. */
  const newest = useRef(0);

  const leaveToList = useCallback(() => {
    if (userId === null) return;
    // In memory, before the redirect: the address bar keeps no lead id and the list shows the notice once.
    listFlash.set(userId, "leadNotFound");
    router.replace(LIST_PATH);
  }, [userId, router]);

  const load = useCallback((): Promise<boolean> => {
    if (userId === null) return Promise.resolve(false);
    const mine = ++newest.current;
    return getLead(leadId, userId).then((result) => {
      const now = live.current;
      if (mine !== newest.current || now === null || now.userId !== userId || now.leadId !== leadId) return false;

      const error = toLeadUiError(result);
      if (error === null && result.ok) {
        setLoaded({ userId, leadId, lead: result.data });
        setProblem(null);
        return true;
      }
      const failure: LeadUiError = error ?? { kind: "retry" };
      switch (detailFailureAction(failure)) {
        case "leave-to-list":
          leaveToList();
          break;
        case "forbidden":
        case "problem":
          setProblem({ userId, leadId, error: failure });
          break;
        case "session":
          // The session screens (RequireSession) answer these; the page keeps what it has and the drafts.
          break;
      }
      return false;
    });
  }, [userId, leadId, leaveToList]);

  useEffect(() => {
    if (userId === null) return;
    live.current = { userId, leadId };
    void load();
    return () => {
      live.current = null;
    };
  }, [userId, leadId, load]);

  const applyNoteResult = useCallback(
    (result: LeadNoteResult) => {
      setLoaded((prev) =>
        prev !== null && prev.userId === userId && prev.leadId === leadId
          ? { ...prev, lead: mergeNoteResult(prev.lead, result) }
          : prev,
      );
    },
    [userId, leadId],
  );

  const applyCommandResult = useCallback(
    (summary: LeadSummary) => {
      setLoaded((prev) =>
        prev !== null && prev.userId === userId && prev.leadId === leadId
          ? { ...prev, lead: mergeSummary(prev.lead, summary) }
          : prev,
      );
    },
    [userId, leadId],
  );

  if (userId === null) return null;

  const busy = busySources.length > 0;

  const current = loaded !== null && loaded.userId === userId && loaded.leadId === leadId ? loaded : null;
  const failure = problem !== null && problem.userId === userId && problem.leadId === leadId ? problem.error : null;
  const retry = () => void load();

  // In-memory, per user (dropped on sign-out or a user change); the plain list when this tab saw none.
  const backHref = lastListUrl.get(userId) ?? LIST_PATH;
  // A violet pill at 90% opacity with a back arrow (owner 2026-10-23); white on it stays above 5:1 on the page
  // background. Full violet on hover.
  const back = (
    <Link
      href={backHref}
      prefetch={false}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-violet-600/90 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
    >
      <ArrowLeftIcon size={16} />
      {t("detail.back")}
    </Link>
  );

  if (failure?.kind === "forbidden") {
    // 403 (E-2): the forbidden notice in place of the lead; nothing of the lead stays on screen.
    return (
      <div className="space-y-4">
        {back}
        <ForbiddenNotice />
        {failure.correlationId !== undefined && (
          <p className="text-xs text-slate-500">{t("errors.supportCode", { correlationId: failure.correlationId })}</p>
        )}
      </div>
    );
  }

  if (current === null) {
    return (
      <div className="space-y-4">
        {back}
        <div aria-live="polite">
          {failure === null ? <DetailSkeleton /> : <LoadProblem error={failure} onRetry={retry} />}
        </div>
      </div>
    );
  }

  const controller: LeadDetailController = {
    userId,
    leadId,
    lead: current.lead,
    version: current.lead.version,
    viewer,
    reload: load,
    applyNoteResult,
    applyCommandResult,
    busy,
    setBusy,
    leaveToList,
  };

  return (
    <LeadDetailProvider value={controller}>
      <div className="space-y-4">
        {back}
        {failure !== null && <LoadProblem error={failure} onRetry={retry} />}
        {/*
          From `xl` up a 2x2 grid whose rows share one height (owner 2026-10-23, D-1 in the order of D-6): the lead |
          Potential duplicates, then Owner contact | Property. Narrower, the cards stack at full width (a half card of
          a 1024px screen is too narrow for its fields). The DOM follows the visual order, so Tab and a screen reader
          do too, and the lead block with the page h1 comes first.
        */}
        <div className="grid gap-4 xl:grid-cols-2">
          <LeadDetailHeader />
          <LeadDuplicates candidates={current.lead.duplicateCandidates ?? NO_ITEMS} />
          <LeadContact lead={current.lead} />
          <LeadAsset lead={current.lead} />
        </div>
        <LeadHistory activities={current.lead.activities ?? NO_ITEMS} />
      </div>
    </LeadDetailProvider>
  );
}
