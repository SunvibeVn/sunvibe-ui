"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";

import { assignFollowUp, type AssignProblems, prepareAssign, sendAssign } from "../lib/assign-flow";
import { selectedAssignee } from "../lib/assignee-pick";
import type { CommandMessage } from "../lib/command-flow";
import { useDraft } from "../lib/drafts";
import { toLeadUiError } from "../lib/lead-ui-error";
import { NOTE_MAX, utf16Length } from "../lib/note-length";
import { listAssignees } from "../services/owner-leads-api";

import { type AssigneePickerLabels, AssigneePicker, type AssigneesLoad } from "./assignee-picker";
import { CommandMessageView } from "./command-message";
import { useLeadDetail } from "./lead-detail-context";

/** Fields of a 400 that have an input in this dialog; any other field gives the general message. */
const ASSIGN_FIELDS: readonly string[] = ["assigneeUserId", "note"];

type AssignState = { problems: AssignProblems; rejected: readonly string[]; correlationId: string | null };

const INITIAL: AssignState = { problems: {}, rejected: [], correlationId: null };

type AssignDialogProps = {
  message: CommandMessage | null;
  onMessage(message: CommandMessage | null): void;
  /** Assigned (or the same person, nothing sent): the slot closes the dialog and shows `message`. */
  onDone(message: CommandMessage | null): void;
  /** Esc, the backdrop, the close button or "Cancel": the slot always closes the dialog (Dialog contract). */
  onClose(): void;
  /** True while the assignment is on its way (also after the dialog closed); the slot locks its buttons meanwhile. */
  onBusy(busy: boolean): void;
};

/**
 * "Assign / Reassign" (US-7, C-29), for `ALL` viewers: a select of the eligible assignees as "<name> · Sale" or
 * "<name> · Sale leader", the current assignee preselected when listed (else "Assigned to <name>" above), an
 * optional note (draft). The same person sends nothing. 422 reloads the list; a 2xx is applied, then the detail
 * reloads (C-36).
 */
export function AssignDialog({ message, onMessage, onDone, onClose, onBusy }: AssignDialogProps) {
  const t = useTranslations("OwnerLeads");
  const controller = useLeadDetail();
  const { userId, leadId, lead } = controller;
  const currentId = lead.assignedUserId ?? null;

  const [note, setNote, clearNote] = useDraft({ userId, leadId, form: "assignNote" });
  const [assignees, setAssignees] = useState<AssigneesLoad>({ state: "loading" });
  /** The person picked by hand; null = the default (the current assignee when listed). */
  const [picked, setPicked] = useState<string | null>(null);

  /** Bumped to load the list again (retry, 422); an answer of an older round is dropped. */
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
  const selected = selectedAssignee(list, picked, currentId);

  const [state, dispatch, pending] = useActionState(async (prev: AssignState): Promise<AssignState> => {
    try {
      return await runAction(prev);
    } finally {
      // Also after the dialog was closed meanwhile: the action goes on and unlocks the opener buttons when done.
      onBusy(false);
    }
  }, INITIAL);

  async function runAction(prev: AssignState): Promise<AssignState> {
    onMessage(null);
    const step = prepareAssign({ selected, currentAssigneeId: currentId, note });
    if (step.kind === "invalid") return { ...INITIAL, problems: step.problems };
    if (step.kind === "unchanged") {
      onDone(null);
      return INITIAL;
    }
    const version = controller.version;
    if (version === undefined) {
      onMessage({ kind: "failed" });
      return INITIAL;
    }

    // The note this submit sends: only it is cleared on success.
    const sentNote = note;
    const outcome = await sendAssign(leadId, step.request, version);
    if (outcome.kind === "saved") {
      // Version first, so it is current even when the reload fails (spec 5.2).
      controller.applyCommandResult(outcome.summary);
      await controller.reload();
      clearNote(sentNote);
      onDone({ kind: "assigned" });
      return INITIAL;
    }
    const next = assignFollowUp(outcome, ASSIGN_FIELDS);
    switch (next.kind) {
      case "leave":
        controller.leaveToList();
        return prev;
      case "fields":
        return { ...INITIAL, rejected: next.fields, correlationId: next.correlationId };
      case "message":
        // 409 (stale, or the lead closed meanwhile: R9) reloads the lead; 422 reloads the assignee list (E-6).
        onMessage(next.message);
        if (next.reload === "lead") await controller.reload();
        else if (next.reload === "assignees") reloadAssignees();
        return INITIAL;
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
  const [dismissed, setDismissed] = useState<AssignState | null>(null);
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

  const currentName = lead.assignedUserName?.trim() ? lead.assignedUserName : t("history.actorUnknown");
  const ready = assignees.state === "ready";

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
      title={currentId === null ? t("assignDialog.title") : t("assignDialog.titleReassign")}
      closeLabel={pending ? undefined : t("assignDialog.cancel")}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {t("assignDialog.cancel")}
          </Button>
          <Button type="submit" form={formId} pending={pending} disabled={!ready || list.length === 0}>
            {pending ? t("assignDialog.submitting") : t("assignDialog.confirm")}
          </Button>
        </>
      }
    >
      <form id={formId} action={dispatch} noValidate className="space-y-4">
        {message !== null && <CommandMessageView message={message} />}
        <fieldset disabled={pending} className="space-y-4">
          {currentId !== null && ready && !list.some((person) => person.userId === currentId) && (
            <p className="text-sm text-slate-700">{t("assignDialog.currentAssignee", { name: currentName })}</p>
          )}
          <AssigneePicker
            id={selectId}
            assignees={assignees}
            selected={selected}
            onPick={(userId) => {
              setPicked(userId === "" ? null : userId);
              edited();
            }}
            error={assigneeError}
            onRetry={reloadAssignees}
            disabled={pending}
            labels={pickerLabels}
          />
          <FormField
            id={noteId}
            label={t("assignDialog.note")}
            error={noteError}
            hint={
              <span className={utf16Length(note) > NOTE_MAX ? "font-semibold text-rose-600" : undefined}>
                {t("assignDialog.noteHint")} {t("counter", { count: utf16Length(note), max: NOTE_MAX })}
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
          {shown.correlationId !== null && (
            <p className="text-xs text-slate-500">{t("errors.supportCode", { correlationId: shown.correlationId })}</p>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}
