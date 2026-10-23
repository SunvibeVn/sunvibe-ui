"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useId, useLayoutEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useSession } from "@/features/auth/client";

import { type CommandMessage, failureMessage } from "../lib/command-flow";
import { useDraft } from "../lib/drafts";
import {
  entryMax,
  entryStatusDraft,
  entryStatusForm,
  type EntryTarget,
  entryTargets,
  KEEP_STATUS,
  noteMessage,
} from "../lib/history-entry";
import { submitNote } from "../lib/note-flow";
import { utf16Length } from "../lib/note-length";
import { statusLabelKey } from "../lib/labels";
import {
  type OriginalChoice,
  type OriginalPreview,
  type OriginalProblem,
  prepareStatusChange,
  resolveOriginal,
  sendStatusChange,
  type StatusContext,
  type StatusRequest,
} from "../lib/status-flow";
import { isClosing } from "../lib/transitions";
import type { DuplicateCandidate } from "../types";

import { CommandMessageView } from "./command-message";
import {
  DuplicatePicker,
  type OriginalLookup,
  type OriginalPick,
  useOriginalProblemText,
  useOriginalText,
} from "./duplicate-picker";
import { HISTORY_CELL } from "./history-cells";
import { useLeadDetail } from "./lead-detail-context";

type Intent = "lookup" | "back";

type EntryState = {
  step: "form" | "confirm";
  /** Problem with ACTIVITY: found here before any call, or named by a 400. */
  activity: "required" | "tooLong" | "rejected" | null;
  /** Problem with the original of a DUPLICATE: found here, or named by a 400. */
  original: OriginalProblem | "rejected" | null;
  /** Support code of a 400 shown at a field. */
  correlationId: string | null;
  /** What the confirmation sends, once confirmed. */
  prepared: { request: StatusRequest; original?: OriginalPreview } | null;
  lookup: OriginalLookup | null;
};

const INITIAL: EntryState = {
  step: "form",
  activity: null,
  original: null,
  correlationId: null,
  prepared: null,
  lookup: null,
};
const NO_CANDIDATES: readonly DuplicateCandidate[] = [];
/** Fields of a 400 that are ACTIVITY (a note, or the reason of a closing status). */
const ACTIVITY_FIELDS: readonly string[] = ["note", "reason"];


/** The support code of an answer, to pass on to a message. */
const support = (outcome: { correlationId?: string }) =>
  outcome.correlationId === undefined ? {} : { correlationId: outcome.correlationId };

type HistoryEntryFormProps = {
  /** Number of the row in the table. */
  no: number;
  /**
   * The last message of this row, held by the history so it stays when the row closes (a reload brought a closed
   * lead, M-3). Shown again inside the confirmation while it is open, since the page under it is inert.
   */
  message: CommandMessage | null;
  onMessage(message: CommandMessage | null): void;
  /** The entry went through: the history closes the row and says so. */
  onSaved(): void;
  /** The note was refused because the lead closed meanwhile: the history keeps the text to copy (W11-36). */
  onClosedRefused(correlationId: string | undefined): void;
};

/**
 * The new row of the history table (owner 2026-10-23, D-4): ACTIVITY text, the signed-in user as PIC, a STATUS select
 * (keep, or an allowed target) and Save. Keeping the status adds a note (US-5); another status changes it (US-6) with
 * ACTIVITY as the optional note, or as the required reason of a closing status, which asks once more "A closed lead
 * cannot be reopened" before sending; DUPLICATE also needs the original (C-21). No next action is sent (D-5). Typed
 * text lives only in the drafts (C-33); only the text that was sent is cleared on success. A status change carries the
 * version of the last answer; a 2xx is applied, then the detail reloads (C-36). The inputs of the row belong to the
 * form in the ACTION cell through their `form` attribute, since a form cannot span table cells.
 */
export function HistoryEntryForm({ no, message, onMessage, onSaved, onClosedRefused }: HistoryEntryFormProps) {
  const t = useTranslations("OwnerLeads");
  const controller = useLeadDetail();
  const { userId, leadId, lead, viewer, busy, setBusy } = controller;
  const { user } = useSession();
  const candidates = lead.duplicateCandidates ?? NO_CANDIDATES;
  const targets = entryTargets(lead.status);
  const ctx: StatusContext = { leadId, candidates, scope: viewer.access === "ALL" ? "all" : "mine" };

  const [activity, setActivity, clearActivity] = useDraft({ userId, leadId, form: "activity" });
  const [duplicateText, setDuplicateText, clearDuplicate] = useDraft({ userId, leadId, form: "duplicate" });
  // The chosen status is a draft too, so it comes back with the text (W11-43).
  const [target, setTarget, clearTarget] = useDraft({ userId, leadId, form: "entryStatus" });
  /** "Find" was pressed: the pending action is the lookup ("Finding…" on its button). */
  const [lookupAsked, setLookupAsked] = useState(false);
  const [pick, setPick] = useState<OriginalPick>(() => (duplicateText.trim() !== "" ? { kind: "text" } : null));

  // A target the lead no longer allows (it was reloaded with another status) falls back to keeping the status.
  const chosen: EntryTarget = targets.find((option) => option === target) ?? KEEP_STATUS;
  const closing = chosen !== KEEP_STATUS && isClosing(chosen);
  const choice: OriginalChoice =
    candidates.length === 0 || pick?.kind === "text"
      ? { kind: "text", text: duplicateText }
      : pick?.kind === "candidate"
        ? { kind: "candidate", id: pick.id }
        : { kind: "none" };

  async function saveNote(prev: EntryState, sent: string): Promise<EntryState> {
    const outcome = await submitNote({ leadId, note: activity, nextAction: "" });
    switch (outcome.kind) {
      case "saved":
        controller.applyNoteResult(outcome.result);
        clearActivity(sent);
        clearTarget();
        onSaved();
        return INITIAL;
      case "invalid":
        return { ...prev, activity: outcome.note ?? null };
      case "closed":
        onClosedRefused(outcome.correlationId);
        // The reload closes the row and shows the kept text; if it fails, say so here (m-1).
        if (!(await controller.reload())) {
          onMessage(failureMessage({ kind: "invalid-transition", ...support(outcome) }));
        }
        return prev;
      case "stale":
        await controller.reload();
        break;
      case "gone":
        controller.leaveToList();
        return prev;
      case "rejected":
        if (outcome.note) return { ...prev, activity: "rejected", correlationId: outcome.correlationId ?? null };
        break;
    }
    onMessage(noteMessage(outcome));
    return prev;
  }

  async function sendChange(
    prev: EntryState,
    request: StatusRequest,
    sent: string,
    sentDuplicate: string,
  ): Promise<EntryState> {
    const version = controller.version;
    if (version === undefined) {
      onMessage({ kind: "failed" });
      return prev;
    }
    const outcome = await sendStatusChange(leadId, request, version);
    switch (outcome.kind) {
      case "saved":
        // Version first, so it is current even when the reload fails (spec 5.2).
        controller.applyCommandResult(outcome.summary);
        await controller.reload();
        clearActivity(sent);
        clearDuplicate(sentDuplicate);
        clearTarget();
        onSaved();
        return INITIAL;
      case "stale":
      case "invalid-transition":
        // W11-35 / E-4: message, reload, typed text kept; back to the form, checked again with the new version.
        onMessage(failureMessage(outcome));
        await controller.reload();
        return { ...prev, step: "form", prepared: null };
      case "rejected": {
        const activityRejected = outcome.fields.some((field) => ACTIVITY_FIELDS.includes(field));
        const originalRejected = outcome.fields.includes("duplicateOfLeadId");
        const known = activityRejected || originalRejected;
        return {
          ...prev,
          step: "form",
          prepared: null,
          activity: activityRejected ? "rejected" : null,
          original: originalRejected ? "rejected" : null,
          correlationId: known ? (outcome.correlationId ?? null) : null,
        };
      }
      case "gone":
        controller.leaveToList();
        return prev;
      default:
        // Shown inside the confirmation too, which stays open for a retry (M-2).
        onMessage(failureMessage(outcome));
        return prev;
    }
  }

  async function runAction(prev: EntryState, payload: FormData | Intent): Promise<EntryState> {
    if (payload === "back") return { ...prev, step: "form", prepared: null };
    onMessage(null);
    const cleared: EntryState = { ...prev, activity: null, original: null, correlationId: null };

    if (payload === "lookup") {
      const text = duplicateText;
      try {
        const resolution = await resolveOriginal({ kind: "text", text }, ctx);
        if (resolution.kind === "lookup-failed") onMessage(failureMessage(resolution.failure));
        return { ...cleared, lookup: { text, resolution } };
      } finally {
        setLookupAsked(false);
      }
    }

    // The fields cannot change while the confirmation is on screen, so these are the texts it was made from.
    const sent = activity;
    const sentDuplicate = duplicateText;
    if (prev.step === "confirm" && prev.prepared !== null) {
      return sendChange(cleared, prev.prepared.request, sent, sentDuplicate);
    }
    if (chosen === KEEP_STATUS) return saveNote(cleared, sent);

    const step = await prepareStatusChange(entryStatusForm(chosen, activity, choice), ctx);
    switch (step.kind) {
      case "invalid": {
        const { reason, note, original } = step.problems;
        return { ...cleared, activity: reason ?? note ?? null, original: original ?? null };
      }
      case "lookup-failed":
        onMessage(failureMessage(step.failure));
        return cleared;
      case "confirm":
        return {
          ...cleared,
          step: "confirm",
          prepared:
            step.original === undefined
              ? { request: step.request }
              : { request: step.request, original: step.original },
        };
      case "send":
        return sendChange(cleared, step.request, sent, sentDuplicate);
    }
  }

  const [state, dispatch, pending] = useActionState(
    async (prev: EntryState, payload: FormData | Intent): Promise<EntryState> => {
      try {
        return await runAction(prev, payload);
      } finally {
        // Released when the command ends, also when the row was unmounted meanwhile (M-1).
        setBusy("entry", false);
      }
    },
    INITIAL,
  );

  // The page-wide lock (CR-2) follows `pending` in a layout effect (an update made inside an action commits only
  // after the action finished); the `finally` above also releases it when the row was unmounted meanwhile.
  useLayoutEffect(() => {
    setBusy("entry", pending);
  }, [pending, setBusy]);

  // Field messages belong to the submit that made them; editing hides them.
  const [dismissed, setDismissed] = useState<EntryState | null>(null);
  const shown = dismissed === state ? { ...state, activity: null, original: null, correlationId: null } : state;
  const edited = () => setDismissed(state);

  const problemText = useOriginalProblemText();
  const originalText = useOriginalText();
  const formId = useId();
  const activityId = useId();
  const activityErrorId = useId();
  // A refused ACTIVITY takes the focus, so the error is read out (m-6).
  useEffect(() => {
    if (state.activity !== null) document.getElementById(activityId)?.focus();
  }, [state, activityId]);

  const max = entryMax(chosen);
  const count = utf16Length(activity);
  const activityError =
    shown.activity === "required"
      ? closing
        ? t("errors.validation.reasonRequired")
        : t("errors.validation.activityRequired")
      : shown.activity === "tooLong"
        ? t("errors.validation.activityTooLong", { max })
        : shown.activity === "rejected"
          ? t(closing ? "errors.fields.reason" : "errors.fields.note")
          : undefined;
  const originalError =
    shown.original === null
      ? undefined
      : shown.original === "rejected"
        ? t("errors.fields.duplicateOfLeadId")
        : problemText(shown.original);

  // Locked while this row or another part of the page has a command on its way (CR-2).
  const locked = pending || busy;
  const confirmStep = state.step === "confirm" && state.prepared !== null ? state.prepared : null;
  const pic = user?.fullName?.trim() || t("history.actorUnknown");

  return (
    <>
      <tr
        role="row"
        className="border-t border-slate-200 bg-violet-50/60 max-xl:mt-2 max-xl:block max-xl:rounded-lg max-xl:px-3 max-xl:py-3"
      >
        <td role="cell" data-label={t("history.columns.no")} className={`${HISTORY_CELL} font-semibold text-violet-700`}>
          {no}
        </td>
        <td role="cell" data-label={t("history.columns.updated")} className={`${HISTORY_CELL} whitespace-nowrap text-slate-500`}>
          {t("history.now")}
        </td>
        <td role="cell" data-label={t("history.columns.activity")} className={HISTORY_CELL}>
          <div className="min-w-0 flex-1">
            <Input
              id={activityId}
              form={formId}
              compact
              value={activity}
              disabled={locked}
              placeholder={closing ? t("history.reasonPlaceholder") : t("history.activityPlaceholder")}
              aria-label={closing ? t("history.reasonLabel") : t("history.activityLabel")}
              aria-required={chosen === KEEP_STATUS || closing ? "true" : undefined}
              invalid={activityError !== undefined}
              aria-describedby={activityErrorId}
              onChange={(event) => {
                setActivity(event.target.value);
                edited();
              }}
            />
            <p id={activityErrorId} className="mt-1 text-xs">
              {activityError !== undefined && <span className="block text-rose-600">{activityError}</span>}
              <span className={count > max ? "font-semibold text-rose-600" : "text-slate-500"}>
                {t("counter", { count, max })}
              </span>
            </p>
          </div>
        </td>
        <td role="cell" data-label={t("history.columns.pic")} className={HISTORY_CELL}>
          {/* The signed-in user, fixed (D-4): shown like a disabled field, wrapping a long name instead of cutting it. */}
          <span
            className="block min-w-0 cursor-not-allowed break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500"
          >
            {pic}
          </span>
        </td>
        <td role="cell" data-label={t("history.columns.status")} className={HISTORY_CELL}>
          <Select
            form={formId}
            compact
            value={chosen}
            disabled={locked}
            aria-label={t("history.statusLabel")}
            onChange={(event) => {
              setTarget(entryStatusDraft(event.target.value));
              edited();
            }}
          >
            {targets.map((option) => (
              <option key={option} value={option}>
                {option === KEEP_STATUS
                  ? t("history.keepStatus", { status: t(statusLabelKey(lead.status)) })
                  : t(statusLabelKey(option))}
              </option>
            ))}
          </Select>
        </td>
        <td role="cell" data-label={t("history.columns.action")} className={HISTORY_CELL}>
          <form id={formId} action={dispatch} noValidate>
            {/* The primary style of the former "Save note", sized for a table row. */}
            <Button type="submit" className="px-5! py-2!" pending={pending && !lookupAsked} disabled={locked}>
              {/* Same label while saving (the spinner shows it), so the button keeps its width in the column. */}
              {t("history.save")}
            </Button>
          </form>
        </td>
      </tr>

      {(chosen === "DUPLICATE" || shown.correlationId !== null) && (
        <tr role="row" className="bg-violet-50/60 max-xl:block max-xl:rounded-b-lg">
          <td role="cell" colSpan={6} className="space-y-3 px-3 pb-3 max-xl:block">
            {chosen === "DUPLICATE" && (
              <DuplicatePicker
                leadId={leadId}
                candidates={candidates}
                pick={pick}
                onPick={(next) => {
                  setPick(next);
                  edited();
                }}
                text={duplicateText}
                onText={(text) => {
                  setDuplicateText(text);
                  edited();
                }}
                lookup={state.lookup}
                onLookup={() => {
                  setLookupAsked(true);
                  startTransition(() => dispatch("lookup"));
                }}
                looking={pending && lookupAsked}
                disabled={locked}
                error={originalError}
              />
            )}
            {shown.correlationId !== null && (
              <p className="text-xs text-slate-500">{t("errors.supportCode", { correlationId: shown.correlationId })}</p>
            )}
          </td>
        </tr>
      )}

      {confirmStep !== null && (
        <tr>
          <td colSpan={6} className="p-0">
            <Dialog
              open
              onClose={() => {
                if (!pending) startTransition(() => dispatch("back"));
              }}
              title={t("statusDialog.closeConfirm")}
              closeLabel={pending ? undefined : t("statusDialog.close")}
              footer={
                <>
                  <Button variant="secondary" disabled={pending} onClick={() => startTransition(() => dispatch("back"))}>
                    {t("statusDialog.back")}
                  </Button>
                  <Button type="submit" form={formId} pending={pending}>
                    {pending ? t("statusDialog.submitting") : t("statusDialog.confirm")}
                  </Button>
                </>
              }
            >
              <div className="space-y-3 text-sm">
                {message !== null && <CommandMessageView message={message} />}
                <Alert tone="error">
                  <p>
                    {t("statusDialog.closeConfirmWith", {
                      status: t(statusLabelKey(confirmStep.request.toStatus)),
                    })}
                  </p>
                </Alert>
                <dl className="space-y-2">
                  <div>
                    <dt className="text-slate-500">{t("statusDialog.reason")}</dt>
                    <dd className="whitespace-pre-wrap break-words text-slate-900">{confirmStep.request.reason}</dd>
                  </div>
                  {confirmStep.original !== undefined && (
                    <div>
                      <dt className="text-slate-500">{t("statusDialog.duplicate.title")}</dt>
                      <dd className="text-slate-900">{originalText(confirmStep.original)}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </Dialog>
          </td>
        </tr>
      )}
    </>
  );
}
