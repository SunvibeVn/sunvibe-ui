"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useLayoutEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { createCompletionGuard } from "../lib/completion-guard";
import { COMMAND_IDLE, commandFailure, commandOutcome, type CommandState, type IntakeMessage as Message } from "../lib/intake-command";
import { type PreviewRead, previewOfRead, runCompletion } from "../lib/preview-state";
import { previewView } from "../lib/preview-view";
import { completeIntake, getIntakePreview } from "../services/intake-api";

import { useIntake, useIntakeLock } from "./intake-context";
import { IntakeMessage } from "./intake-message";
import { PreviewDetails } from "./preview-details";
import { StepCard } from "./step-card";

type CompletionState = CommandState & { completed: boolean };

const INITIAL: CompletionState = { ...COMMAND_IDLE, completed: false };

/**
 * The preview and the completion bound to it (U-3, U-5). A preview belongs to one version of the block and one read: a
 * refusal forgets it, so only a preview read again can be completed. What a completion answers shows on the page, because
 * the read after it takes this step away.
 */
export function PreviewStep() {
  const t = useTranslations("InventoryIntake");
  const { leadId, block, reload, leave, notify, busy } = useIntake();
  const version = block.version ?? null;
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<PreviewRead | null>(null);
  const [readFailed, setReadFailed] = useState<Message | null>(null);
  const [guard] = useState(createCompletionGuard);

  useEffect(() => {
    let dropped = false;
    void getIntakePreview(leadId).then((result) => {
      if (dropped) return;
      if (result.ok) {
        setRead({ version, attempt, preview: result.data });
        setReadFailed(null);
        return;
      }
      const failure = commandFailure(result);
      if (failure.kind === "leave") leave();
      else if (failure.kind === "message") {
        setReadFailed(failure.message);
        if (failure.reload) void reload();
      }
    });
    return () => {
      dropped = true;
    };
  }, [leadId, version, attempt, reload, leave]);

  // Next keeps this route hidden (Activity): the address and the masked account do not stay in it.
  useLayoutEffect(() => () => setRead(null), []);

  const preview = previewOfRead(read, version, attempt);
  const view = preview === null ? null : previewView(preview);
  const hash = view?.hash ?? null;

  const [state, dispatch, pending] = useActionState(async (): Promise<CompletionState> => {
    if (hash === null) {
      guard.leave(false);
      return INITIAL;
    }
    notify(null);
    const step = await runCompletion({
      send: () => completeIntake(leadId, { expectedVersion: block.version ?? undefined, previewHash: hash }),
      clear: () => setAttempt((count) => count + 1),
      reload,
    });
    guard.leave(step.kind === "done");
    if (step.kind === "done") {
      notify({ key: "preview.completed" }, "success");
      return { ...COMMAND_IDLE, completed: true };
    }
    if (step.kind === "leave") leave();
    // Every refusal read the block, whatever kind it is.
    const { state: form, notice } = commandOutcome(step);
    const shown = notice ?? form.message;
    if (shown !== null) notify(shown);
    return INITIAL;
  }, INITIAL);
  useIntakeLock("completion", pending);

  const submit = () => {
    if (guard.enter()) dispatch();
  };

  return (
    <StepCard title={t("preview.title")}>
      {readFailed !== null && (
        <div className="space-y-3">
          <IntakeMessage value={readFailed} />
          <Button variant="secondary" disabled={busy} onClick={() => setAttempt((count) => count + 1)}>
            {t("preview.retry")}
          </Button>
        </div>
      )}
      {view === null ? (
        readFailed === null && (
          <div role="status" aria-busy="true">
            <span className="sr-only">{t("preview.loading")}</span>
            <div aria-hidden className="h-24 animate-pulse rounded-lg bg-slate-100" />
          </div>
        )
      ) : (
        <form action={submit} noValidate className="space-y-4">
          <PreviewDetails view={view} />
          <p className="text-sm text-slate-700">{t("preview.note")}</p>
          <Button type="submit" pending={pending} disabled={busy || hash === null || state.completed}>
            {pending ? t("preview.completing") : t("preview.complete")}
          </Button>
        </form>
      )}
    </StepCard>
  );
}
