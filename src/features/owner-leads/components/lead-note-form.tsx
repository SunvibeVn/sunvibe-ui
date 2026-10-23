"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { ForbiddenNotice } from "@/features/auth/client";

import { useDraft } from "../lib/drafts";
import { formatDateTime } from "../lib/format";
import { NOTE_MAX, utf16Length } from "../lib/note-length";
import { type NoteOutcome, submitNote } from "../lib/note-flow";
import { isClosedLeadStatus } from "../types";

import { DetailSection } from "./detail-layout";
import { useLeadDetail } from "./lead-detail-context";

type FormState = { outcome: NoteOutcome | null };

const INITIAL: FormState = { outcome: null };

/**
 * Note and next action at the bottom of the detail (US-5). Text lives only in the in-memory drafts (C-33), never in
 * component state; the fields are locked while the note is sent, and on success only the text that was sent is
 * cleared. A 201 updates the page without a reload (C-36). A 403 shows the forbidden notice in place (spec 5.2). On a
 * closed lead the form is hidden; text typed before the lead closed stays visible and copyable (W11-36) until the
 * user drops it.
 */
export function LeadNoteForm() {
  const t = useTranslations("OwnerLeads");
  const controller = useLeadDetail();
  const { userId, leadId, lead } = controller;
  const [note, setNote, clearNote] = useDraft({ userId, leadId, form: "note" });
  const [nextAction, setNextAction, clearNextAction] = useDraft({ userId, leadId, form: "nextAction" });
  const noteId = useId();
  const nextActionId = useId();

  const [state, formAction, pending] = useActionState(async (): Promise<FormState> => {
    // The texts this submit sends: only they are cleared on success (typing after it started is kept).
    const sent = { note, nextAction };
    const outcome = await submitNote({ leadId, ...sent });
    switch (outcome.kind) {
      case "saved":
        controller.applyNoteResult(outcome.result);
        clearNote(sent.note);
        clearNextAction(sent.nextAction);
        break;
      case "closed":
      case "stale":
        await controller.reload();
        break;
      case "gone":
        controller.leaveToList();
        break;
    }
    return { outcome };
  }, INITIAL);

  // The message belongs to the submit that made it; typing hides it.
  const [dismissed, setDismissed] = useState<FormState | null>(null);
  const outcome = dismissed === state ? null : state.outcome;
  const edited = () => setDismissed(state);

  if (isClosedLeadStatus(lead.status)) {
    if (note === "") return null;
    // The "not saved" text only when this note was refused because the lead closed (409); else a neutral label.
    const refused = state.outcome?.kind === "closed" ? state.outcome : null;
    return (
      <DetailSection title={t("noteForm.title")}>
        <div className="mt-3 space-y-3">
          {refused !== null ? (
            <Alert tone="info">
              <p>{t("noteForm.closedKeepText")}</p>
              {refused.correlationId !== undefined && (
                <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId: refused.correlationId })}</p>
              )}
            </Alert>
          ) : (
            <p className="text-sm text-slate-600">{t("noteForm.keptDraft")}</p>
          )}
          <Textarea
            readOnly
            rows={5}
            value={note}
            aria-label={t("noteForm.note")}
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            variant="secondary"
            className="px-4 py-2"
            onClick={() => {
              clearNote();
              clearNextAction();
            }}
          >
            {t("noteForm.discardDraft")}
          </Button>
        </div>
      </DetailSection>
    );
  }

  const count = utf16Length(note);
  const noteError =
    outcome?.kind === "invalid" && outcome.note !== undefined
      ? outcome.note === "required"
        ? t("errors.validation.noteRequired")
        : t("errors.validation.noteTooLong", { max: NOTE_MAX })
      : outcome?.kind === "rejected" && outcome.note
        ? t("errors.fields.note")
        : undefined;
  const nextActionError =
    outcome?.kind === "invalid" && outcome.nextAction !== undefined
      ? t("errors.validation.nextActionInvalid")
      : outcome?.kind === "rejected" && outcome.nextAction
        ? t("errors.fields.nextActionAt")
        : undefined;

  const formMessage =
    outcome?.kind === "closed"
      ? t("noteForm.closedKeepText")
      : outcome?.kind === "stale"
        ? t("errors.concurrent")
        : outcome?.kind === "failed"
          ? t("errors.generic")
          : outcome?.kind === "rejected" && !outcome.note && !outcome.nextAction
            ? t("errors.badRequest")
            : undefined;
  const correlationId =
    outcome !== null && "correlationId" in outcome && outcome.correlationId !== undefined
      ? outcome.correlationId
      : undefined;

  const current =
    lead.nextActionAt === undefined ? t("detail.noNextAction") : formatDateTime(lead.nextActionAt) || t("detail.noNextAction");

  return (
    <DetailSection title={t("noteForm.title")}>
      <form action={formAction} noValidate className="mt-3">
        <fieldset disabled={pending} className="space-y-4">
          <FormField
            id={noteId}
            label={t("noteForm.note")}
            error={noteError}
            hint={
              <span className={count > NOTE_MAX ? "font-semibold text-rose-600" : undefined}>
                {t("noteForm.counter", { count, max: NOTE_MAX })}
              </span>
            }
          >
            <Textarea
              id={noteId}
              rows={5}
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
            label={t("noteForm.nextAction")}
            error={nextActionError}
            hint={
              <>
                <span className="block">{t("noteForm.currentNextAction", { time: current })}</span>
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
          {formMessage !== undefined && (
            <Alert tone="error">
              <p>{formMessage}</p>
              {correlationId !== undefined && (
                <p className="mt-1 text-xs">{t("errors.supportCode", { correlationId })}</p>
              )}
            </Alert>
          )}
          {outcome?.kind === "forbidden" && (
            <div>
              <ForbiddenNotice />
              {correlationId !== undefined && (
                <p className="px-4 text-xs text-rose-800">{t("errors.supportCode", { correlationId })}</p>
              )}
            </div>
          )}
          {outcome?.kind === "saved" && <Alert tone="success">{t("noteForm.saved")}</Alert>}
          <SubmitButton fullWidth={false}>{t("noteForm.submit")}</SubmitButton>
        </fieldset>
      </form>
    </DetailSection>
  );
}
