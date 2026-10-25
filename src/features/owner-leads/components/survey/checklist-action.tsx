"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { startChecklist, type SurveyBlock, toChecklistUiError } from "@/features/surveys";

import { forgetLeadChecklists } from "../../lib/checklist/page-state";
import { checklistHref } from "../../lib/checklist/routes";
import { tabDrafts } from "../../lib/drafts";
import { checklistAction, checklistStartFailure, type IntakeField } from "../../lib/checklist/start-flow";
import { useLeadDetail } from "../lead-detail-context";

import { IntakeDialog } from "./intake-dialog";

const LINK =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

type Failure = { message: string; correlationId?: string } | null;

/**
 * The checklist action of the current visit in the Survey section's top row (survey-checklist spec 6.1, W16-25):
 * "Start checklist (survey #n)" (with the intake dialog when the starter is not the performer), "Open checklist #m",
 * or the one-line reason. A start holds the page's command lock, applies its answer (History row) without another
 * read and opens the checklist page.
 */
export function ChecklistAction({ block }: { block: NonNullable<SurveyBlock> }) {
  const t = useTranslations("OwnerLeads");
  const router = useRouter();
  const { userId, leadId, busy, setBusy, reloadSurvey, leaveToList, applyChecklistStarted } = useLeadDetail();
  const [pending, setPending] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const [fieldProblems, setFieldProblems] = useState<Partial<Record<IntakeField, "invalid">>>({});

  useLayoutEffect(() => {
    setBusy("checklist", pending);
  }, [pending, setBusy]);
  useLayoutEffect(() => () => setBusy("checklist", false), [setBusy]);

  const action = checklistAction(block);
  if (action === null) return null;
  if (action.kind === "open") {
    return (
      <Link href={checklistHref(leadId, action.checklistId)} prefetch={false} className={LINK}>
        {t("checklist.action.open", { no: action.checklistNo ?? "" })}
      </Link>
    );
  }
  if (action.kind === "blocked") return <p className="text-sm text-slate-600">{t(`checklist.blockedBy.${action.reason}`)}</p>;

  const start = async (intake: { reason: string; basis: { confirmedOn: string; text: string } } | null, done?: () => void) => {
    if (pending) return;
    setPending(true);
    setFailure(null);
    setFieldProblems({});
    try {
      const result = await startChecklist(action.appointmentId, { intake });
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

  const label = t("checklist.action.start", { no: action.surveyNo ?? "" });
  return (
    <>
      <Button
        disabled={busy && !pending}
        pending={pending && !intakeOpen}
        onClick={() => (action.intake ? setIntakeOpen(true) : void start(null))}
      >
        {pending && !intakeOpen ? t("checklist.action.starting") : label}
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
          surveyNo={action.surveyNo}
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
