"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { OwnerLeadsKey } from "@/features/lead-shared";

import { previewModel } from "../../lib/checklist/preview-model";
import { createInFlightGuard, submitFailureStep, submitPanelState } from "../../lib/checklist/submission-model";

import { useChecklistPage } from "./checklist-context";
import { ReadinessList } from "./readiness-list";
import { SubmitConfirmDialog } from "./submit-confirm-dialog";
import { useUnsavedChanges } from "./use-leave-guard";

type Failure = { texts: OwnerLeadsKey[]; correlationId?: string };

/**
 * "Submit for review" under the known gaps of an editable draft (survey-checklist submission spec 6.1, U-1): the button
 * when the read allows it, else the first failing gate. A second click while one is on its way is ignored; a repeat
 * the server already took answers 200 and counts as a success (A-4). Every panel waits for the answer.
 */
export function SubmitPanel() {
  const t = useTranslations("OwnerLeads");
  const { view, userId, leadId, checklistId, locks, submit } = useChecklistPage();
  const [guard] = useState(createInFlightGuard);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const unsaved = useUnsavedChanges({ userId, leadId, checklistId });
  const model = useMemo(() => previewModel(view, t), [view, t]);
  const state = submitPanelState(view);
  const failureRef = useRef<HTMLDivElement>(null);
  // The button may be gone after the read of a refusal: focus lands on the reason, not on the page body.
  useEffect(() => {
    if (failure !== null) failureRef.current?.focus();
  }, [failure]);
  if (state.kind === "hidden") return null;

  const send = () =>
    void guard.run(async () => {
      setPending(true);
      setFailure(null);
      const outcome = await submit();
      setPending(false);
      setOpen(false);
      if (outcome.kind === "saved") return;
      const step = submitFailureStep(outcome.error);
      if (step.kind === "message") {
        setFailure(step.correlationId === undefined ? { texts: step.texts } : { texts: step.texts, correlationId: step.correlationId });
      }
    });

  return (
    <section aria-labelledby="cl-submit-title" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 id="cl-submit-title" className="text-base font-semibold text-slate-900">
        {t("checklist.submit.title")}
      </h2>
      <ReadinessList title={t("checklist.preview.gaps")} lines={model.gaps} empty={t("checklist.preview.noGaps")} />
      {failure !== null && (
        <div ref={failureRef} tabIndex={-1} aria-live="polite" className="focus:outline-none">
          <Alert tone="error">
            {failure.texts.map((text) => (
              <p key={text}>{t(text)}</p>
            ))}
            {failure.correlationId !== undefined && (
              <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: failure.correlationId })}</p>
            )}
          </Alert>
        </div>
      )}
      {state.kind === "available" ? (
        <Button disabled={locks.all || pending} onClick={() => setOpen(true)}>
          {t("checklist.submit.button")}
        </Button>
      ) : (
        <p className="text-sm font-medium text-slate-700">{t(state.text)}</p>
      )}
      {open && (
        <SubmitConfirmDialog
          unconfirmed={model.unconfirmed.map((line) => line.text)}
          warnings={model.warnings}
          unsaved={unsaved}
          pending={pending}
          onClose={() => setOpen(false)}
          onConfirm={send}
        />
      )}
    </section>
  );
}
