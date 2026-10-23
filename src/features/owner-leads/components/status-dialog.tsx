"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useId, useLayoutEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { type CommandMessage, failureMessage } from "../lib/command-flow";
import { useDraft } from "../lib/drafts";
import { formatDateTime } from "../lib/format";
import { statusLabelKey } from "../lib/labels";
import { NOTE_MAX, utf16Length } from "../lib/note-length";
import {
  type OriginalChoice,
  type OriginalPreview,
  prepareStatusChange,
  REASON_MAX,
  resolveOriginal,
  sendStatusChange,
  type StatusContext,
  type StatusProblems,
  type StatusRequest,
} from "../lib/status-flow";
import { allowedTargets, isClosing } from "../lib/transitions";
import { type DuplicateCandidate, isLeadStatus, type LeadStatus } from "../types";

import { CommandMessageView } from "./command-message";
import {
  DuplicatePicker,
  type OriginalLookup,
  type OriginalPick,
  useOriginalProblemText,
  useOriginalText,
} from "./duplicate-picker";
import { useLeadDetail } from "./lead-detail-context";

/** Fields of a 400 that have an input in this dialog; any other field gives the general message. */
const STATUS_FIELDS: readonly string[] = ["reason", "note", "nextActionAt", "duplicateOfLeadId"];

type Intent = "lookup" | "back";

type StatusState = {
  step: "form" | "confirm";
  /** Problems found here before any call. */
  problems: StatusProblems;
  /** Fields the server rejected with a 400. */
  rejected: readonly string[];
  /** Support code of that 400. */
  correlationId: string | null;
  /** What the confirmation step sends, once confirmed. */
  prepared: { request: StatusRequest; original?: OriginalPreview } | null;
  lookup: OriginalLookup | null;
};

const INITIAL: StatusState = {
  step: "form",
  problems: {},
  rejected: [],
  correlationId: null,
  prepared: null,
  lookup: null,
};
const NO_CANDIDATES: readonly DuplicateCandidate[] = [];

type StatusDialogProps = {
  /** The last command message (kept by the actions slot so it survives the dialog). */
  message: CommandMessage | null;
  onMessage(message: CommandMessage | null): void;
  /** The change went through (or nothing was sent): the slot closes the dialog and shows `message`. */
  onDone(message: CommandMessage | null): void;
  /** Esc, the backdrop, the close button or "Cancel": the slot always closes the dialog (Dialog contract). */
  onClose(): void;
  /** True while the change is on its way (also after the dialog closed); the slot locks its buttons meanwhile. */
  onBusy(busy: boolean): void;
};

/** The drafts a submit was prepared from: only these texts are cleared on success. */
type SentDrafts = { reason: string; note: string; nextAction: string; duplicate: string };

/**
 * "Change status" (US-6): exactly the targets of `allowedTargets`; a non-closing target takes an optional note and
 * next action; a closing target needs a reason (1..500), hides the next action and asks a second time "A closed lead
 * cannot be reopened" before sending. DUPLICATE needs the original (C-21). Typed text lives only in the drafts (C-33).
 * Every send carries the version of the last answer; a 2xx is applied, then the detail reloads (C-36).
 */
export function StatusDialog({ message, onMessage, onDone, onClose, onBusy }: StatusDialogProps) {
  const t = useTranslations("OwnerLeads");
  const controller = useLeadDetail();
  const { userId, leadId, lead, viewer } = controller;
  const candidates = lead.duplicateCandidates ?? NO_CANDIDATES;
  const targets = isLeadStatus(lead.status) ? allowedTargets(lead.status) : [];
  const ctx: StatusContext = { leadId, candidates, scope: viewer.access === "ALL" ? "all" : "mine" };

  const [reason, setReason, clearReason] = useDraft({ userId, leadId, form: "reason" });
  const [note, setNote, clearNote] = useDraft({ userId, leadId, form: "statusNote" });
  const [nextAction, setNextAction, clearNextAction] = useDraft({ userId, leadId, form: "statusNextAction" });
  const [duplicateText, setDuplicateText, clearDuplicate] = useDraft({ userId, leadId, form: "duplicate" });

  const [target, setTarget] = useState<LeadStatus | null>(null);
  /** "Find" was pressed: the pending action is the lookup ("Finding…" on its button). */
  const [lookupAsked, setLookupAsked] = useState(false);
  const [pick, setPick] = useState<OriginalPick>(() => (duplicateText.trim() !== "" ? { kind: "text" } : null));

  const chosen = target !== null && targets.includes(target) ? target : null;
  const closing = chosen !== null && isClosing(chosen);
  const choice: OriginalChoice =
    candidates.length === 0 || pick?.kind === "text"
      ? { kind: "text", text: duplicateText }
      : pick?.kind === "candidate"
        ? { kind: "candidate", id: pick.id }
        : { kind: "none" };

  async function send(prev: StatusState, request: StatusRequest, sent: SentDrafts): Promise<StatusState> {
    const version = controller.version;
    if (version === undefined) {
      onMessage({ kind: "failed" });
      return prev;
    }
    return applyOutcome(prev, await sendStatusChange(leadId, request, version), sent);
  }

  async function applyOutcome(
    prev: StatusState,
    outcome: Awaited<ReturnType<typeof sendStatusChange>>,
    sent: SentDrafts,
  ): Promise<StatusState> {
    switch (outcome.kind) {
      case "saved":
        // Version first, so it is current even when the reload fails (spec 5.2).
        controller.applyCommandResult(outcome.summary);
        await controller.reload();
        clearReason(sent.reason);
        clearNote(sent.note);
        clearNextAction(sent.nextAction);
        clearDuplicate(sent.duplicate);
        onDone({ kind: "status-saved" });
        return INITIAL;
      case "stale":
      case "invalid-transition":
        // W11-35 / E-4: message, reload, typed text kept in the drafts. Back to the form, so the kept text is in its
        // field and the next send is checked again with the new version. The dialog stays unless the lead now has
        // another status; then the message stays below the buttons.
        onMessage(failureMessage(outcome));
        await controller.reload();
        return { ...prev, step: "form", prepared: null, problems: {}, rejected: [] };
      case "rejected": {
        const known = outcome.fields.filter((field) => STATUS_FIELDS.includes(field));
        onMessage(known.length === 0 ? failureMessage(outcome) : null);
        return {
          ...prev,
          step: "form",
          prepared: null,
          problems: {},
          rejected: known,
          correlationId: known.length > 0 ? (outcome.correlationId ?? null) : null,
        };
      }
      case "gone":
        controller.leaveToList();
        return prev;
      default:
        onMessage(failureMessage(outcome));
        return prev;
    }
  }

  const [state, dispatch, pending] = useActionState(
    async (prev: StatusState, payload: FormData | Intent): Promise<StatusState> => {
      try {
        return await runAction(prev, payload);
      } finally {
        // Also after the dialog was closed meanwhile: the action goes on and unlocks the opener buttons when done.
        onBusy(false);
      }
    },
    INITIAL,
  );

  async function runAction(prev: StatusState, payload: FormData | Intent): Promise<StatusState> {
    if (payload === "back") return { ...prev, step: "form", prepared: null };
    onMessage(null);
    const cleared: StatusState = { ...prev, problems: {}, rejected: [], correlationId: null };

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

    // The fields cannot change while the confirmation step is on screen, so these are the texts it was made from.
    const sent: SentDrafts = { reason, note, nextAction, duplicate: duplicateText };
    if (prev.step === "confirm" && prev.prepared !== null) return send(cleared, prev.prepared.request, sent);

    const step = await prepareStatusChange({ target: chosen, reason, note, nextAction, original: choice }, ctx);
    switch (step.kind) {
      case "invalid":
        return { ...cleared, problems: step.problems };
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
        return send(cleared, step.request, sent);
    }
  }

  // The lock is taken here, in a layout effect, not inside the action: a state update made inside an action is in the
  // action's transition and commits only after it finished, i.e. after the unlock (CR-2). While pending commits as
  // false (dialog still mounted) the lock is released too.
  const onBusyRef = useRef(onBusy);
  useLayoutEffect(() => {
    onBusyRef.current = onBusy;
  });
  useLayoutEffect(() => {
    onBusyRef.current(pending);
  }, [pending]);

  // Field messages belong to the submit that made them; editing hides them.
  const [dismissed, setDismissed] = useState<StatusState | null>(null);
  const shown = dismissed === state ? INITIAL : state;
  const edited = () => setDismissed(state);
  const rejected = (field: string) => shown.rejected.includes(field);

  const problemText = useOriginalProblemText();
  const originalText = useOriginalText();
  const formId = useId();
  const groupName = useId();
  const targetErrorId = useId();
  const reasonId = useId();
  const noteId = useId();
  const nextActionId = useId();

  const targetError = shown.problems.target === "required" ? t("statusDialog.targetRequired") : undefined;
  const reasonError =
    shown.problems.reason === "required"
      ? t("errors.validation.reasonRequired")
      : shown.problems.reason === "tooLong"
        ? t("errors.validation.reasonTooLong", { max: REASON_MAX })
        : rejected("reason")
          ? t("errors.fields.reason")
          : undefined;
  const noteError =
    shown.problems.note === "tooLong"
      ? t("errors.validation.noteTooLong", { max: NOTE_MAX })
      : rejected("note")
        ? t("errors.fields.note")
        : undefined;
  const nextActionError =
    shown.problems.nextAction === "invalid"
      ? t("errors.validation.nextActionInvalid")
      : rejected("nextActionAt")
        ? t("errors.fields.nextActionAt")
        : undefined;
  const originalError =
    shown.problems.original !== undefined
      ? problemText(shown.problems.original)
      : rejected("duplicateOfLeadId")
        ? t("errors.fields.duplicateOfLeadId")
        : undefined;

  const currentNextAction =
    lead.nextActionAt === undefined
      ? t("detail.noNextAction")
      : formatDateTime(lead.nextActionAt) || t("detail.noNextAction");

  const confirmStep = state.step === "confirm" && state.prepared !== null ? state.prepared : null;

  const formStep = (
    <fieldset disabled={pending} className="space-y-4">
      <fieldset aria-describedby={targetError === undefined ? undefined : targetErrorId}>
        <legend className="text-sm font-medium text-slate-700">{t("statusDialog.target")}</legend>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {targets.map((status) => (
            <label
              key={status}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
            >
              <input
                type="radio"
                name={groupName}
                className="h-4 w-4 accent-violet-700"
                checked={chosen === status}
                onChange={() => {
                  setTarget(status);
                  edited();
                }}
              />
              {t(statusLabelKey(status))}
            </label>
          ))}
        </div>
        {targetError !== undefined && (
          <p id={targetErrorId} className="mt-1 text-sm text-rose-600">
            {targetError}
          </p>
        )}
      </fieldset>

      {closing && (
        <FormField
          id={reasonId}
          label={t("statusDialog.reason")}
          required
          error={reasonError}
          hint={
            <span className={utf16Length(reason) > REASON_MAX ? "font-semibold text-rose-600" : undefined}>
              {t("statusDialog.reasonHint", { max: REASON_MAX })}{" "}
              {t("noteForm.counter", { count: utf16Length(reason), max: REASON_MAX })}
            </span>
          }
        >
          <Textarea
            id={reasonId}
            rows={3}
            value={reason}
            aria-required="true"
            invalid={reasonError !== undefined}
            aria-describedby={describedBy(reasonId, reasonError, true)}
            onChange={(event) => {
              setReason(event.target.value);
              edited();
            }}
          />
        </FormField>
      )}

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
          disabled={pending}
          error={originalError}
        />
      )}

      {chosen !== null && !closing && (
        <>
          <FormField
            id={noteId}
            label={t("statusDialog.note")}
            error={noteError}
            hint={
              <span className={utf16Length(note) > NOTE_MAX ? "font-semibold text-rose-600" : undefined}>
                {t("statusDialog.noteHint")} {t("noteForm.counter", { count: utf16Length(note), max: NOTE_MAX })}
              </span>
            }
          >
            <Textarea
              id={noteId}
              rows={3}
              value={note}
              invalid={noteError !== undefined}
              aria-describedby={describedBy(noteId, noteError, true)}
              onChange={(event) => {
                setNote(event.target.value);
                edited();
              }}
            />
          </FormField>
          <FormField
            id={nextActionId}
            label={t("statusDialog.nextAction")}
            error={nextActionError}
            hint={
              <>
                <span className="block">{t("noteForm.currentNextAction", { time: currentNextAction })}</span>
                <span className="block">{t("noteForm.nextActionHint")}</span>
              </>
            }
          >
            <Input
              id={nextActionId}
              type="datetime-local"
              value={nextAction}
              invalid={nextActionError !== undefined}
              aria-describedby={describedBy(nextActionId, nextActionError, true)}
              onChange={(event) => {
                setNextAction(event.target.value);
                edited();
              }}
            />
          </FormField>
        </>
      )}

      {shown.correlationId !== null && (
        <p className="text-xs text-slate-500">{t("errors.supportCode", { correlationId: shown.correlationId })}</p>
      )}
    </fieldset>
  );

  const closingStatus = confirmStep === null ? null : confirmStep.request.toStatus;

  const confirmBody = confirmStep !== null && (
    <div className="space-y-3">
      <Alert tone="error" title={t("statusDialog.closeConfirm")}>
        <p>{t("statusDialog.closeConfirmWith", { status: t(statusLabelKey(closingStatus ?? undefined)) })}</p>
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
  );

  const footer =
    confirmStep !== null ? (
      <>
        <Button variant="secondary" disabled={pending} onClick={() => startTransition(() => dispatch("back"))}>
          {t("statusDialog.back")}
        </Button>
        <Button type="submit" form={formId} pending={pending}>
          {pending ? t("statusDialog.submitting") : t("statusDialog.confirm")}
        </Button>
      </>
    ) : (
      <>
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          {t("statusDialog.cancel")}
        </Button>
        <Button type="submit" form={formId} pending={pending} disabled={targets.length === 0}>
          {closing ? t("statusDialog.continue") : t("statusDialog.confirm")}
        </Button>
      </>
    );

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("statusDialog.title")}
      closeLabel={pending ? undefined : t("statusDialog.cancel")}
      footer={footer}
    >
      <form id={formId} action={dispatch} noValidate className="space-y-4">
        {message !== null && <CommandMessageView message={message} />}
        {confirmBody || formStep}
      </form>
    </Dialog>
  );
}
