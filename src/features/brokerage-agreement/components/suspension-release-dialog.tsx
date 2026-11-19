"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

import type { EligibilityKey } from "../lib/reason-text";
import type { StopOutcome } from "../lib/suspension-flow";
import { type ReleaseField, releaseErrors, releaseServerErrors, STOP_TEXT_MAX } from "../lib/suspension-form";
import { releaseSuspension } from "../lib/suspension-release-flow";

import { StopOutcomeNotice } from "./stop-outcome-notice";

type SuspensionReleaseDialogProps = {
  agreementId: string;
  /** The data version the page read, sent back as `expectedDataVersion` (brokerage-agreement BR-5, S8-D6). */
  dataVersion: number;
  /** "Keep it", Esc or the backdrop, while no request runs: the section closes the dialog. */
  onClose: () => void;
  /** A 204: the section closes the dialog and the page reads the agreement again. */
  onDone: () => void;
  /** A 403 or another 409: the section closes the dialog, the page reads again and shows the code's sentence. */
  onChanged: (code: string) => void;
  /** "Reload" after a change made at the same time: the page reads the agreement again. */
  onReload: () => void;
};

type ReleaseState = { errors: Partial<Record<ReleaseField, EligibilityKey>>; outcome: StopOutcome | null; round: number };

const INITIAL: ReleaseState = { errors: {}, outcome: null, round: 0 };

/**
 * "Lift the suspension" (brokerage-agreement US-5 AC-5, BR-15, S8-D6): a required private reason (BR-17), then "Lift" or
 * "Keep it". The browser refuses a blank reason or one over 500 characters as the body sends it (E05S8-P5) before any
 * request; one request per click, with the data version the page read. Only a manager who is not the lead's assigned
 * Sale may lift it: the server decides, and its refusal is read by code.
 */
export function SuspensionReleaseDialog({ agreementId, dataVersion, onClose, onDone, onChanged, onReload }: SuspensionReleaseDialogProps) {
  const t = useTranslations("BrokerageAgreement");
  const reasonId = useId();
  const [reason, setReason] = useState("");

  /** Set when "Lift" is pressed, cleared when its action ends: a click meanwhile is not even queued. */
  const sending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  const [state, dispatch, pending] = useActionState(async (prev: ReleaseState): Promise<ReleaseState> => {
    const round = prev.round + 1;
    try {
      const errors = releaseErrors(reason);
      if (Object.keys(errors).length > 0) return { errors, outcome: null, round };
      const outcome = await releaseSuspension(agreementId, { reason, dataVersion });
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
  const server = outcome?.kind === "fields" ? releaseServerErrors(outcome.fields) : { errors: {}, other: false };

  const submit = () => {
    if (sending.current || handedBack) return;
    sending.current = true;
    dispatch();
  };

  // After an answer its message takes the focus; else the field in error.
  useEffect(() => {
    if (state.round === 0) return;
    if (messageRef.current !== null) messageRef.current.focus();
    else formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const close = () => {
    if (!busy) onClose();
  };
  const errorKey = errors.reason ?? server.errors.reason;
  const reasonError = errorKey === undefined ? undefined : t(errorKey);

  return (
    <Dialog open onClose={close} title={t("stop.releaseDialog.title")}>
      <form ref={formRef} action={submit} noValidate className="space-y-4">
        <StopOutcomeNotice ref={messageRef} outcome={outcome} otherFields={server.other} onReload={onReload} />
        <FormField id={reasonId} label={t("stop.releaseDialog.reason")} error={reasonError}>
          <Textarea
            id={reasonId}
            name="reason"
            rows={3}
            maxLength={STOP_TEXT_MAX}
            value={reason}
            disabled={busy}
            invalid={reasonError !== undefined}
            aria-describedby={describedBy(reasonId, reasonError)}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={close}>
            {t("stop.releaseDialog.keep")}
          </Button>
          <SubmitButton fullWidth={false} disabled={busy}>
            {t("stop.releaseDialog.submit")}
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
