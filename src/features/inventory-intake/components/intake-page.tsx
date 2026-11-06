"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { ArrowLeftIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/client";
import { WORKSPACE_HOME } from "@/features/workspace";

import { leadRoute } from "../lib/intake-routes";
import { type IntakeStep, intakeSteps } from "../lib/intake-steps";
import { intakeViewer } from "../lib/intake-viewer";
import { INTAKE_STATUS_LABEL } from "../lib/labels";
import type { IntakeMessage as Message } from "../lib/intake-command";
import { sectionAfter } from "../lib/section-visibility";
import { getIntakeBlock, getLeadFacts, type LeadFacts, toIntakeUiError } from "../services/intake-api";
import type { IntakeBlock } from "../types";

import { AvailabilityStep } from "./availability-step";
import { CaseGate } from "./case-gate";
import { GatePanel } from "./gate-panel";
import { type IntakeController, IntakeProvider } from "./intake-context";
import { IntakeMessage } from "./intake-message";
import { OwnerCheckPanel } from "./owner-check-panel";
import { OwnerCheckStatus } from "./owner-check-status";
import { OwnerStep } from "./owner-step";
import { PreviewStep } from "./preview-step";
import { RestorationStep } from "./restoration-step";
import { ResultPanel } from "./result-panel";
import { SelectionStep } from "./selection-step";
import { SuspensionsPanel } from "./suspensions-panel";
import { TargetStep } from "./target-step";

/** A read of the page, for one user and one lead. */
type Loaded = { userId: string; leadId: string; block: IntakeBlock; facts: LeadFacts };
type Problem = { correlationId?: string };

function Step({ step }: { step: IntakeStep }) {
  switch (step.name) {
    case "selection":
      return <SelectionStep mode={step.mode} />;
    case "owner":
      return <OwnerStep mode={step.mode} />;
    case "ownerCheck":
      return <OwnerCheckStatus />;
    case "target":
      return <TargetStep mode={step.mode} />;
    case "availability":
      return <AvailabilityStep mode={step.mode} />;
    case "preview":
      return <PreviewStep />;
    case "case":
      return <CaseGate />;
    case "result":
      return <ResultPanel />;
    case "restoration":
      return <RestorationStep />;
  }
}

const backClass =
  "inline-flex min-h-8 items-center gap-1.5 rounded-full bg-violet-600/90 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

/**
 * The intake page of a lead (spec 6.1). Read in the browser only; an answer for another user, another lead, a hidden page
 * or an older call is dropped, and a 404 leaves nothing of the intake on screen.
 */
export function IntakePage({ leadId }: { leadId: string }) {
  const t = useTranslations("InventoryIntake");
  const { user } = useSession();
  const userId = user?.userId ?? null;
  const roles = user?.roles;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [gone, setGone] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState<{ message: Message; tone: "error" | "success" } | null>(null);
  const [busySources, setBusySources] = useState<readonly string[]>([]);
  const setBusy = useCallback((source: string, busy: boolean) => {
    setBusySources((prev) => {
      const rest = prev.filter((item) => item !== source);
      return busy ? [...rest, source] : rest.length === prev.length ? prev : rest;
    });
  }, []);
  /** The user and lead the page shows now; null while the route is hidden. */
  const live = useRef<{ userId: string; leadId: string } | null>(null);
  /** Number of the newest read; an older answer is dropped. */
  const newest = useRef(0);

  const notify = useCallback((message: Message | null, tone: "error" | "success" = "error") => {
    // A command that ends after the route was hidden leaves nothing to find on the way back.
    if (message !== null && live.current === null) return;
    setNotice(message === null ? null : { message, tone });
  }, []);

  const leave = useCallback(() => {
    newest.current += 1;
    setLoaded(null);
    setProblem(null);
    setNotice(null);
    setGone(true);
  }, []);

  const load = useCallback((): Promise<void> => {
    if (userId === null) return Promise.resolve();
    const mine = ++newest.current;
    return Promise.all([getIntakeBlock(leadId), getLeadFacts(leadId)]).then(([blockResult, factsResult]) => {
      const now = live.current;
      if (mine !== newest.current || now === null || now.userId !== userId || now.leadId !== leadId) return;

      const view = sectionAfter(blockResult);
      if (view.kind === "hidden") {
        const error = toIntakeUiError(blockResult);
        // The session screens answer these; the page keeps what it has.
        if (error?.kind !== "signed-out" && error?.kind !== "unavailable") leave();
        return;
      }
      if (view.kind === "error") {
        setProblem(view.correlationId === undefined ? {} : { correlationId: view.correlationId });
        return;
      }
      if (!factsResult.ok) {
        const error = toIntakeUiError(factsResult);
        if (error?.kind === "not-found" || error?.kind === "forbidden") leave();
        else if (error?.kind !== "signed-out" && error?.kind !== "unavailable") setProblem({});
        return;
      }
      setLoaded({ userId, leadId, block: view.block, facts: factsResult.data });
      setProblem(null);
      setGone(false);
    });
  }, [userId, leadId, leave]);

  useEffect(() => {
    if (userId === null) return;
    live.current = { userId, leadId };
    void load();
    return () => {
      live.current = null;
    };
  }, [userId, leadId, load]);

  // Next keeps this route hidden (Activity) after navigating away: nothing of the intake stays in it.
  useLayoutEffect(
    () => () => {
      setLoaded(null);
      setNotice(null);
    },
    [],
  );

  const apply = useCallback(
    (block: IntakeBlock) => {
      if (live.current === null) return;
      // This answer is newer than any read still on its way.
      newest.current += 1;
      setEpoch((count) => count + 1);
      setLoaded((prev) => (prev !== null && prev.userId === userId && prev.leadId === leadId ? { ...prev, block } : prev));
    },
    [userId, leadId],
  );

  const current = loaded !== null && loaded.userId === userId && loaded.leadId === leadId ? loaded : null;
  const assignedUserId = current?.facts.assignedUserId ?? null;
  const viewer = useMemo(
    () => intakeViewer({ userId: userId ?? "", roles: roles ?? [], assignedUserId }),
    [userId, roles, assignedUserId],
  );

  if (userId === null) return null;

  if (gone) {
    return (
      <div className="space-y-4">
        <Alert>{t("page.gone")}</Alert>
        <Link href={WORKSPACE_HOME} prefetch={false} className={backClass}>
          <ArrowLeftIcon size={16} />
          {t("page.leads")}
        </Link>
      </div>
    );
  }

  const back = (
    <Link href={leadRoute(leadId)} prefetch={false} className={backClass}>
      <ArrowLeftIcon size={16} />
      {t("page.back")}
    </Link>
  );

  const failure =
    problem === null ? null : (
      <div className="space-y-3">
        <Alert tone="error">
          <p>{t("page.loadFailed")}</p>
          {problem.correlationId !== undefined && (
            <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: problem.correlationId })}</p>
          )}
        </Alert>
        <Button variant="secondary" onClick={() => void load()}>
          {t("page.retry")}
        </Button>
      </div>
    );

  if (current === null) {
    return (
      <div className="space-y-4">
        {back}
        {failure ?? (
          <div role="status" aria-busy="true">
            <span className="sr-only">{t("page.loading")}</span>
            <div aria-hidden className="h-32 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
          </div>
        )}
      </div>
    );
  }

  const { block, facts } = current;
  const controller: IntakeController = {
    leadId,
    wardCode: facts.wardCode,
    block,
    viewer,
    epoch,
    busy: busySources.length > 0,
    setBusy,
    reload: load,
    apply,
    leave,
    notify,
  };
  const steps = intakeSteps(block, viewer);

  return (
    <IntakeProvider value={controller}>
      <div className="space-y-4">
        {back}
        {failure}
        <header className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-navy-950">{t("page.title")}</h1>
            <Badge tone="info">{t(INTAKE_STATUS_LABEL[block.status ?? "NONE"])}</Badge>
          </div>
          {facts.requestCode !== null && <p className="text-sm text-slate-600">{t("page.request", { code: facts.requestCode })}</p>}
          {!viewer.assignee && steps.length > 0 && <p className="text-sm text-slate-600">{t("page.readOnly")}</p>}
        </header>
        {notice !== null && <IntakeMessage value={notice.message} tone={notice.tone} />}
        <GatePanel />
        {steps.map((step) => (
          <Step key={step.name} step={step} />
        ))}
        <OwnerCheckPanel />
        <SuspensionsPanel />
      </div>
    </IntakeProvider>
  );
}
