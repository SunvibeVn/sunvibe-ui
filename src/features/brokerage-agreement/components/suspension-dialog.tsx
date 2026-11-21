"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

import type { EligibilityKey } from "../lib/reason-text";
import { type StopOutcome, suspend } from "../lib/suspension-flow";
import {
  EMPTY_SUSPENSION_VALUES,
  STOP_TEXT_MAX,
  type SuspensionField,
  suspensionErrors,
  suspensionServerErrors,
  type SuspensionValues,
} from "../lib/suspension-form";
import { SUSPENSION_REASONS, suspensionReasonChoiceText } from "../lib/stop-text";

import { StopOutcomeNotice } from "./stop-outcome-notice";

type SuspensionDialogProps = {
  agreementId: string;
  /** "Keep it", Esc or the backdrop, while no request runs: the section closes the dialog. */
  onClose: () => void;
  /** A 204: the section closes the dialog and the page reads the agreement again. */
  onDone: () => void;
  /** A 403 or another 409: the section closes the dialog, the page reads again and shows the code's sentence. */
  onChanged: (code: string) => void;
  /** "Reload" after a change made at the same time: the page reads the agreement again. */
  onReload: () => void;
};

/** What the last attempt left on screen: the browser's checks, or the server's answer. */
type SuspendState = { errors: Partial<Record<SuspensionField, EligibilityKey>>; outcome: StopOutcome | null; round: number };

const INITIAL: SuspendState = { errors: {}, outcome: null, round: 0 };

/**
 * "Suspend" (brokerage-agreement US-5 AC-2, BR-15, S8-D6): one of four reasons, picked by the manager, and an optional
 * private note (BR-17), then "Suspend" or "Keep it". The browser checks the reason and the note's length as the body
 * sends it (E05S8-P5) before any request; it sends one request per click and no data version (S8-D8). The server
 * decides who may suspend and on which state: its refusal is read by code.
 */
export function SuspensionDialog({ agreementId, onClose, onDone, onChanged, onReload }: SuspensionDialogProps) {
  const t = useTranslations("BrokerageAgreement");
  const reasonId = useId();
  const noteId = useId();
  const [values, setValues] = useState<SuspensionValues>(EMPTY_SUSPENSION_VALUES);

  /** Set when "Suspend" is pressed, cleared when its action ends: a click meanwhile is not even queued. */
  const sending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  const [state, dispatch, pending] = useActionState(async (prev: SuspendState): Promise<SuspendState> => {
    const round = prev.round + 1;
    try {
      const errors = suspensionErrors(values);
      if (values.reasonType === "" || Object.keys(errors).length > 0) return { errors, outcome: null, round };
      const outcome = await suspend(agreementId, { reasonType: values.reasonType, noteText: values.note });
      if (outcome.kind === "done") onDone();
      if (outcome.kind === "changed") onChanged(outcome.code);
      return { errors: {}, outcome, round };
    } catch {
      return { errors: {}, outcome: { kind: "failed" }, round };
    } finally {
      sending.current = false;
    }
  }, INITIAL);

  const { errors, outcome } = state;
  const handedBack = outcome?.kind === "done" || outcome?.kind === "changed";
  const busy = pending || handedBack;
  const server = outcome?.kind === "fields" ? suspensionServerErrors(outcome.fields) : { errors: {}, other: false };

  const submit = () => {
    if (sending.current || handedBack) return;
    sending.current = true;
    dispatch();
  };

  // After an answer its message takes the focus; else the first field in error.
  useEffect(() => {
    if (state.round === 0) return;
    if (messageRef.current !== null) messageRef.current.focus();
    else formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const close = () => {
    if (!busy) onClose();
  };
  const errorOf = (field: SuspensionField): string | undefined => {
    const key = errors[field] ?? server.errors[field];
    return key === undefined ? undefined : t(key);
  };
  const reasonError = errorOf("reasonType");
  const noteError = errorOf("note");

  return (
    <Dialog open onClose={close} title={t("stop.suspendDialog.title")}>
      <form ref={formRef} action={submit} noValidate className="space-y-4">
        <StopOutcomeNotice ref={messageRef} outcome={outcome} otherFields={server.other} onReload={onReload} />
        <FormField id={reasonId} label={t("stop.suspendDialog.reason")} error={reasonError}>
          <Select
            id={reasonId}
            name="reasonType"
            value={values.reasonType}
            disabled={busy}
            invalid={reasonError !== undefined}
            aria-describedby={describedBy(reasonId, reasonError)}
            onChange={(event) => {
              const reasonType = SUSPENSION_REASONS.find((code) => code === event.target.value) ?? "";
              setValues((current) => ({ ...current, reasonType }));
            }}
          >
            <option value="">{t("stop.suspendDialog.chooseReason")}</option>
            {SUSPENSION_REASONS.map((code) => (
              <option key={code} value={code}>
                {t(suspensionReasonChoiceText(code))}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id={noteId} label={t("stop.suspendDialog.note")} optional error={noteError}>
          <Textarea
            id={noteId}
            name="note"
            rows={3}
            maxLength={STOP_TEXT_MAX}
            value={values.note}
            disabled={busy}
            invalid={noteError !== undefined}
            aria-describedby={describedBy(noteId, noteError)}
            onChange={(event) => {
              const { value } = event.target;
              setValues((current) => ({ ...current, note: value }));
            }}
          />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={close}>
            {t("stop.suspendDialog.keep")}
          </Button>
          <SubmitButton fullWidth={false} disabled={busy}>
            {t("stop.suspendDialog.submit")}
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
