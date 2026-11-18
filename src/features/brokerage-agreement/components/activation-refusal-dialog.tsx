"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useActionState, useEffect, useId, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

import { type ActivationRefusalOutcome, refuseActivation } from "../lib/activation-refusal-flow";
import type { EligibilityKey } from "../lib/reason-text";
import type { ActivationRefusalType } from "../types";

type ActivationRefusalDialogProps = {
  agreementId: string;
  /** The number of the version awaiting activation that this dialog refuses. */
  versionNo: number;
  /** The data version the page read, sent back as `expectedDataVersion` (brokerage-agreement BR-5, S6-D4). */
  dataVersion: number;
  /** "Keep it", Esc or the backdrop, while no refusal runs: the form closes the dialog. */
  onClose: () => void;
  /** A 204: the page reads the agreement again. */
  onRefused: () => void;
  /** The version no longer awaits activation: the page says so and reads the agreement again. */
  onChanged: () => void;
  /** "Reload" after a change made meanwhile: the page reads the agreement again. */
  onReload: () => void;
};

/** What the last refusal left on screen. */
type RefusalState = { outcome: ActivationRefusalOutcome | null; round: number };

const INITIAL: RefusalState = { outcome: null, round: 0 };

/** The server's bound on the note, in UTF-16 units as the field counts them (brokerage-agreement S6-D4). */
const NOTE_MAX = 500;

/** The two reasons, in the order the dialog offers them, with no default choice (E05S6-P9 (f)). */
const REASON_TYPES = ["DOCUMENT_DIFFERS", "SIGNER_NOT_OWNER"] as const satisfies readonly ActivationRefusalType[];

const REFUSAL_TEXT = {
  notIndependent: "activation.errors.notIndependent",
  notFound: "activation.errors.notFound",
  concurrent: "activation.errors.concurrent",
} as const satisfies Record<string, EligibilityKey>;

/**
 * "Refuse activation" of the version the owner confirmed (brokerage-agreement US-3 AC-3, S6-D4): one of two reasons,
 * picked by the manager, an optional private note (BR-17), then "Refuse" or "Keep it". It sends one request per click.
 * The note is checked by the server only: its refusal shows on the field. A 204 hands back, so the page reads the
 * agreement again and the assigned Sale may open a new draft.
 */
export function ActivationRefusalDialog({
  agreementId,
  versionNo,
  dataVersion,
  onClose,
  onRefused,
  onChanged,
  onReload,
}: ActivationRefusalDialogProps) {
  const t = useTranslations("BrokerageAgreement");
  const noteId = useId();
  const choiceName = useId();
  const legendId = useId();
  const [reasonType, setReasonType] = useState<ActivationRefusalType | null>(null);
  const [note, setNote] = useState("");

  /** Set when "Refuse" is pressed, cleared when its action ends: a click meanwhile is not even queued. */
  const sending = useRef(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const [state, dispatch, pending] = useActionState(async (prev: RefusalState): Promise<RefusalState> => {
    const round = prev.round + 1;
    try {
      if (reasonType === null) return { outcome: null, round };
      const outcome = await refuseActivation(agreementId, { versionNo, reasonType, noteText: note, dataVersion });
      if (outcome.kind === "recorded") onRefused();
      if (outcome.kind === "refused" && outcome.reason === "reload") onChanged();
      return { outcome, round };
    } catch {
      return { outcome: { kind: "failed" }, round };
    } finally {
      sending.current = false;
    }
  }, INITIAL);

  const submit = () => {
    if (sending.current || state.outcome?.kind === "recorded" || reasonType === null) return;
    sending.current = true;
    dispatch();
  };

  // After a refusal the message takes the focus; the note's own refusal stays on its field.
  useEffect(() => {
    const { outcome } = state;
    if (state.round === 0 || outcome === null || outcome.kind === "recorded") return;
    if (outcome.kind === "refused" && (outcome.reason === "badNote" || outcome.reason === "reload")) return;
    messageRef.current?.focus();
  }, [state]);

  const { outcome } = state;
  const busy = pending || outcome?.kind === "recorded";
  const close = () => {
    if (!busy) onClose();
  };
  const badNote = outcome?.kind === "refused" && outcome.reason === "badNote";
  const noteError = badNote ? t("activation.refusal.errors.badNote") : undefined;

  let message: ReactNode = null;
  if (
    outcome?.kind === "refused" &&
    (outcome.reason === "notIndependent" || outcome.reason === "notFound" || outcome.reason === "concurrent")
  ) {
    message = (
      <Alert tone="error">
        <p>{t(REFUSAL_TEXT[outcome.reason])}</p>
        {outcome.reason === "concurrent" && (
          <Button variant="secondary" className="mt-2 px-4 py-2" onClick={onReload}>
            {t("activation.reload")}
          </Button>
        )}
      </Alert>
    );
  } else if (outcome?.kind === "failed") {
    message = (
      <Alert tone="error">
        <p>{t("activation.refusal.errors.failed")}</p>
        {outcome.correlationId !== undefined && (
          <p className="mt-1 text-xs">{t("activation.supportCode", { code: outcome.correlationId })}</p>
        )}
      </Alert>
    );
  }

  return (
    <Dialog open onClose={close} title={t("activation.refusal.title", { number: versionNo })}>
      <form action={submit} noValidate className="space-y-4">
        {message !== null && (
          <div ref={messageRef} tabIndex={-1} className="outline-none">
            {message}
          </div>
        )}
        <fieldset aria-labelledby={legendId} className="space-y-2">
          <legend id={legendId} className="text-sm font-medium text-slate-700">
            {t("activation.refusal.reason")}
          </legend>
          {REASON_TYPES.map((type) => (
            <label key={type} className="flex items-start gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name={choiceName}
                value={type}
                checked={reasonType === type}
                disabled={busy}
                onChange={() => setReasonType(type)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
              />
              <span>{t(`activation.refusal.${type}`)}</span>
            </label>
          ))}
        </fieldset>
        <FormField id={noteId} label={t("activation.refusal.note")} optional error={noteError}>
          <Textarea
            id={noteId}
            name="note"
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            invalid={badNote}
            aria-describedby={describedBy(noteId, noteError)}
            onChange={(event) => setNote(event.target.value)}
          />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={close}>
            {t("activation.refusal.keep")}
          </Button>
          <SubmitButton fullWidth={false} disabled={busy || reasonType === null}>
            {t("activation.refusal.submit")}
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
