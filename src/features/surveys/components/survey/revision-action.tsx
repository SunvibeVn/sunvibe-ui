"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { tabDrafts } from "@/features/lead-shared/client";

import { toChecklistUiError } from "../../lib/checklist-ui-error";
import { forgetLeadChecklists } from "../../lib/checklist/page-state";
import { checklistHref } from "../../lib/checklist/routes";
import { checklistStartFailure, type IntakeField, revisionAction } from "../../lib/checklist/start-flow";

import { startRevision } from "../../services/checklists-api";
import type { SurveyBlock } from "../../types";
import { IntakeDialog } from "./intake-dialog";
import { useSurveyPanel } from "./survey-panel-context";

type Failure = { message: string; correlationId?: string } | null;

/**
 * "Start revision #n" after a return for documents (survey-checklist submission spec 6.1, A-7), with the intake dialog
 * when the viewer did not hold the previous revision; or why it waits for someone else. A start holds the page's command
 * lock, applies its answer (History row) without another read and opens the new revision.
 */
export function RevisionAction({ block }: { block: NonNullable<SurveyBlock> }) {
  const t = useTranslations("OwnerLeads");
  const router = useRouter();
  const { userId, leadId, busy, setBusy, reloadSurvey, leaveToList, applyChecklistStarted } = useSurveyPanel();
  const [pending, setPending] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const [fieldProblems, setFieldProblems] = useState<Partial<Record<IntakeField, "invalid">>>({});

  useLayoutEffect(() => {
    setBusy("revision", pending);
  }, [pending, setBusy]);
  useLayoutEffect(() => () => setBusy("revision", false), [setBusy]);

  const action = revisionAction(block);
  if (action === null) return null;
  if (action.kind === "blocked") return <p className="text-sm text-slate-600">{t(`checklist.revision.blockedBy.${action.reason}`)}</p>;

  const start = async (intake: { reason: string; basis: { confirmedOn: string; text: string } } | null, done?: () => void) => {
    if (pending) return;
    setPending(true);
    setFailure(null);
    setFieldProblems({});
    try {
      const result = await startRevision(action.checklistId, { intake });
      const error = toChecklistUiError(result);
      if (error === null && result.ok) {
        done?.();
        applyChecklistStarted(result.data);
        const checklistId = result.data.checklist?.id;
        if (checklistId) router.push(checklistHref(leadId, checklistId));
        return;
      }
      if (error === null) return;
      const step = checklistStartFailure(error);
      switch (step.kind) {
        case "leave":
          forgetLeadChecklists(tabDrafts, { userId, leadId });
          leaveToList();
          return;
        case "session":
          return;
        case "fields":
          setFieldProblems(step.problems);
          return;
        case "message":
          setFailure(
            step.correlationId === undefined
              ? { message: t(`checklist.startErrors.${step.message}`) }
              : { message: t(`checklist.startErrors.${step.message}`), correlationId: step.correlationId },
          );
          if (step.reload) {
            setIntakeOpen(false);
            await reloadSurvey();
          }
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        disabled={busy && !pending}
        pending={pending && !intakeOpen}
        onClick={() => (action.intake ? setIntakeOpen(true) : void start(null))}
      >
        {pending && !intakeOpen ? t("checklist.revision.starting") : t("checklist.revision.start", { no: action.revisionNo })}
      </Button>
      {failure !== null && !intakeOpen && (
        <div className="basis-full" aria-live="polite">
          <Alert tone="error">
            <p>{failure.message}</p>
            {failure.correlationId !== undefined && (
              <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: failure.correlationId })}</p>
            )}
          </Alert>
        </div>
      )}
      {intakeOpen && (
        <IntakeDialog
          surveyNo={null}
          revisionNo={action.revisionNo}
          performerName={action.performerName}
          arrivedAt={action.arrivedAt}
          pending={pending}
          serverProblems={fieldProblems}
          message={failure?.message ?? null}
          onClose={() => {
            setIntakeOpen(false);
            setFailure(null);
          }}
          onStart={(intake, done) => void start(intake, done)}
        />
      )}
    </>
  );
}
