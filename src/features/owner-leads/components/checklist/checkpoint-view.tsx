"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { type ChecklistCheckpoint, getCheckpoint, toChecklistUiError } from "@/features/surveys";

import { checkpointFailure } from "../../lib/checklist/page-state";
import { previewSections } from "../../lib/checklist/preview-model";

import { useChecklistPage } from "./checklist-context";
import { ChecklistSections } from "./checklist-sections";
import { PageBanners } from "./page-banners";

type Load = { state: "loading" } | { state: "ready"; checkpoint: ChecklistCheckpoint } | { state: "error"; correlationId?: string };

/**
 * A takeover's snapshot, read-only (survey-checklist spec 6.2, W16-28): the groups as they were just before the
 * takeover, rendered like the preview, with the legal banner. Read through its own endpoint (access-logged).
 */
export function CheckpointView({ takeoverNo, onClose }: { takeoverNo: number; onClose(): void }) {
  const t = useTranslations("OwnerLeads");
  const { checklistId, view, earlier, fail } = useChecklistPage();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    void getCheckpoint(checklistId, takeoverNo).then((result) => {
      if (cancelled) return;
      const error = toChecklistUiError(result);
      if (error === null && result.ok) {
        setLoad({ state: "ready", checkpoint: result.data });
        return;
      }
      const failure = error ?? { kind: "retry" as const };
      const step = checkpointFailure(failure);
      if (step === "leave") void fail(failure);
      else if (step === "inline") {
        setLoad(failure.correlationId === undefined ? { state: "error" } : { state: "error", correlationId: failure.correlationId });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [checklistId, takeoverNo, fail]);

  return (
    <section aria-labelledby="checkpoint-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="checkpoint-title" className="text-lg font-semibold text-slate-900">
          {t("checklist.takeover.snapshotTitle", { no: takeoverNo })}
        </h2>
        <Button variant="secondary" onClick={onClose}>
          {t("checklist.takeover.closeSnapshot")}
        </Button>
      </div>
      <PageBanners earlier={earlier} withLaterVisit={false} />
      {load.state === "loading" && (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t("checklist.takeover.snapshotLoading")}</span>
          <div aria-hidden className="h-40 animate-pulse rounded-xl bg-slate-100" />
        </div>
      )}
      {load.state === "error" && (
        <Alert tone="error">
          <p>{t("checklist.takeover.snapshotFailed")}</p>
          {load.correlationId !== undefined && (
            <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: load.correlationId })}</p>
          )}
        </Alert>
      )}
      {load.state === "ready" && (
        <ChecklistSections sections={previewSections(load.checkpoint.snapshot?.groups ?? {}, view, t)} idPrefix="cp" />
      )}
    </section>
  );
}
