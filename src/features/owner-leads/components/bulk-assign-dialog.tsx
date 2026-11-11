"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { ForbiddenNotice } from "@/features/auth/client";
import { useDraft } from "@/features/lead-shared/client";

import { selectedAssignee } from "../lib/assignee-pick";
import {
  type BulkAssignEnd,
  type BulkAssignProblems,
  prepareBulkAssign,
  sendBulkAssign,
} from "../lib/bulk-assign-flow";
import { toBulkAssignModel } from "../lib/bulk-assign-model";
import { heldByOthers, type LeadSelection, surveyMoves } from "../lib/lead-selection-state";
import { toLeadUiError } from "../lib/lead-ui-error";
import { NOTE_MAX, utf16Length } from "../lib/note-length";
import { listAssignees } from "../services/owner-leads-api";

import { AssigneePicker, type AssigneePickerLabels, type AssigneesLoad } from "./assignee-picker";

/** A message for the whole request that keeps the dialog open (acquisition-owner-lead-bulk-assign D-11). */
type BulkMessage = "badRequest" | "ineligible" | "forbidden";

type BulkState = {
  problems: BulkAssignProblems;
  /** 400 fields that have an input here (`assigneeUserId`, `note`). */
  rejected: readonly string[];
  message: BulkMessage | null;
  correlationId: string | null;
};

const INITIAL: BulkState = { problems: {}, rejected: [], message: null, correlationId: null };

type BulkAssignDialogProps = {
  userId: string;
  /** The rows selected when "Assign selected" was pressed: the request and the summary are built from them (D-8). */
  selection: LeadSelection;
  /** Esc, the backdrop, the close button or "Cancel": the list view always closes the dialog (Dialog contract). */
  onClose(): void;
  /** True while the request is on its way, also after the dialog closed (D-12). */
  onBusy(busy: boolean): void;
  /** A 200, a whole-request 409 or an unknown outcome: the list view closes the dialog, shows it and reloads (D-10). */
  onEnd(end: BulkAssignEnd): void;
};

/**
 * "Assign selected" (acquisition-owner-lead-bulk-assign US-2, D-9, D-11): the eligible people of the single assignment,
 * nobody preselected; the optional note (a tab draft of the list); once a person is picked, how many leads go to whom,
 * how many are held by someone else now, and how many scheduled surveys move. "Assign" sends one request; while it
 * runs the dialog is locked, and a second click sends nothing.
 */
export function BulkAssignDialog({ userId, selection, onClose, onBusy, onEnd }: BulkAssignDialogProps) {
  const t = useTranslations("OwnerLeads");

  const [note, setNote, clearNote] = useDraft({ userId, leadId: "", form: "bulkAssignNote" });
  const [assignees, setAssignees] = useState<AssigneesLoad>({ state: "loading" });
  const [picked, setPicked] = useState<string | null>(null);

  /** Bumped to load the people again (retry, 422); an answer of an older round is dropped. */
  const [round, setRound] = useState(0);
  const reloadAssignees = () => {
    setAssignees({ state: "loading" });
    setRound((n) => n + 1);
  };

  useEffect(() => {
    let cancelled = false;
    void listAssignees().then((result) => {
      if (cancelled) return;
      setAssignees(
        result.ok
          ? { state: "ready", list: result.data }
          : { state: "error", error: toLeadUiError(result) ?? { kind: "retry" } },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [round]);

  const list = assignees.state === "ready" ? assignees.list : [];
  // Nobody preselected: a bulk action has no current assignee (D-9). A person who left the list (422) is dropped.
  const selected = selectedAssignee(list, picked, null);
  const person = list.find((candidate) => candidate.userId === selected);
  const name = person?.fullName?.trim() ? person.fullName : t("history.actorUnknown");

  /** One request per dialog at a time; none after the action ended (a click queued behind it sends nothing). */
  const sending = useRef(false);
  const ended = useRef(false);

  const [state, dispatch, pending] = useActionState(async (prev: BulkState): Promise<BulkState> => {
    try {
      return await runAction(prev);
    } finally {
      // Also after the dialog was closed meanwhile: the action goes on and unlocks the list when its answer is handled.
      onBusy(false);
    }
  }, INITIAL);

  async function runAction(prev: BulkState): Promise<BulkState> {
    if (sending.current || ended.current) return prev;
    const step = prepareBulkAssign({ selected, leads: selection, note });
    if (step.kind === "invalid") return { ...INITIAL, problems: step.problems };

    // The note this submit sends: only it is cleared on success.
    const sentNote = note;
    sending.current = true;
    let outcome: Awaited<ReturnType<typeof sendBulkAssign>>;
    try {
      outcome = await sendBulkAssign(step.request);
    } finally {
      sending.current = false;
    }

    switch (outcome.kind) {
      case "done":
        ended.current = true;
        // The note is kept unless a lead was assigned with it (spec 6.2).
        if (toBulkAssignModel(selection, outcome.result).totals.assigned > 0) clearNote(sentNote);
        onEnd({ kind: "result", sent: selection, result: outcome.result });
        return INITIAL;
      case "conflict":
      case "unknown":
        ended.current = true;
        onEnd({ kind: outcome.kind, correlationId: outcome.correlationId });
        return INITIAL;
      case "fields":
        return { ...INITIAL, rejected: outcome.fields, correlationId: outcome.correlationId };
      case "rejected":
        return { ...INITIAL, message: "badRequest", correlationId: outcome.correlationId };
      case "ineligible":
        reloadAssignees();
        return { ...INITIAL, message: "ineligible", correlationId: outcome.correlationId };
      case "forbidden":
        return { ...INITIAL, message: "forbidden", correlationId: outcome.correlationId };
      case "signed-out":
        // The session flow takes the user to sign-in; the note stays in the drafts until the sign-out drops it.
        return INITIAL;
    }
  }

  // The lock is taken in a layout effect, not inside the action: a state update made inside an action commits only
  // after it finished, i.e. after the unlock (as the assign dialog does).
  const onBusyRef = useRef(onBusy);
  useLayoutEffect(() => {
    onBusyRef.current = onBusy;
  });
  useLayoutEffect(() => {
    onBusyRef.current(pending);
  }, [pending]);

  // Messages belong to the submit that made them; editing hides them.
  const [dismissed, setDismissed] = useState<BulkState | null>(null);
  const shown = dismissed === state ? INITIAL : state;
  const edited = () => setDismissed(state);

  const formId = useId();
  const selectId = useId();
  const noteId = useId();

  const assigneeError =
    shown.problems.assignee === "required"
      ? t("errors.validation.assigneeRequired")
      : shown.rejected.includes("assigneeUserId")
        ? t("errors.fields.assigneeUserId")
        : undefined;
  const noteError =
    shown.problems.note === "tooLong"
      ? t("errors.validation.noteTooLong", { max: NOTE_MAX })
      : shown.rejected.includes("note")
        ? t("errors.fields.note")
        : undefined;
  // `leads: "count"` cannot come from the list (one page holds at most 20 rows); it reads as the general message.
  const general =
    shown.message === "ineligible"
      ? t("errors.ineligibleAssignee")
      : shown.message === "badRequest" || shown.problems.leads === "count"
        ? t("errors.badRequest")
        : null;
  const support =
    shown.correlationId !== null ? (
      <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: shown.correlationId })}</p>
    ) : null;

  const ready = assignees.state === "ready" && list.length > 0;
  const moves = selected === "" ? 0 : surveyMoves(selection, selected);

  const pickerLabels: AssigneePickerLabels = {
    loading: t("assignDialog.loading"),
    loadFailed: t("filters.assigneeLoadFailed"),
    supportCode: (correlationId) => t("errors.supportCode", { correlationId }),
    retry: t("errors.retry"),
    noOptions: t("assignDialog.noOptions"),
    label: t("assignDialog.assignee"),
    placeholder: t("assignDialog.assigneePlaceholder"),
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("bulkAssign.title", { count: selection.length })}
      closeLabel={pending ? undefined : t("assignDialog.cancel")}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {t("assignDialog.cancel")}
          </Button>
          <Button type="submit" form={formId} pending={pending} disabled={!ready || selected === ""}>
            {pending ? t("assignDialog.submitting") : t("assignDialog.confirm")}
          </Button>
        </>
      }
    >
      <form id={formId} action={dispatch} noValidate className="space-y-4">
        {shown.message === "forbidden" ? (
          <div>
            <ForbiddenNotice />
            {support !== null && <div className="px-4 text-rose-800">{support}</div>}
          </div>
        ) : general !== null ? (
          <Alert tone="error">
            <p>{general}</p>
            {support}
          </Alert>
        ) : null}
        <fieldset disabled={pending} className="space-y-4">
          <AssigneePicker
            id={selectId}
            assignees={assignees}
            selected={selected}
            onPick={(next) => {
              setPicked(next === "" ? null : next);
              edited();
            }}
            error={assigneeError}
            onRetry={reloadAssignees}
            disabled={pending}
            labels={pickerLabels}
          />
          <div aria-live="polite" className="space-y-1 text-sm text-slate-800">
            {selected !== "" && (
              <>
                <p className="font-semibold">{t("bulkAssign.summary", { count: selection.length, name })}</p>
                <p>{t("bulkAssign.heldByOthers", { count: heldByOthers(selection, selected) })}</p>
                {moves > 0 && <p>{t("bulkAssign.surveyMoves", { count: moves, name })}</p>}
              </>
            )}
          </div>
          <FormField
            id={noteId}
            label={t("assignDialog.note")}
            error={noteError}
            hint={
              <span className={utf16Length(note) > NOTE_MAX ? "font-semibold text-rose-600" : undefined}>
                {t("bulkAssign.noteHint")} {t("counter", { count: utf16Length(note), max: NOTE_MAX })}
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
          {shown.message === null && general === null && support}
        </fieldset>
      </form>
    </Dialog>
  );
}
