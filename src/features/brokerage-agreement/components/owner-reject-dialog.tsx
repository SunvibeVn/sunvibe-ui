"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useActionState, useEffect, useId, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

import { type OwnerRejectOutcome, rejectVersion } from "../lib/owner-reject-flow";
import type { EligibilityKey } from "../lib/reason-text";

type OwnerRejectDialogProps = {
  agreementId: string;
  /** The number of the version this dialog declines. */
  versionNo: number;
  /** "Keep it", Esc or the backdrop, while no rejection runs: the page closes the dialog. */
  onClose: () => void;
  /** A 204: the page closes the dialog and reads the list again. */
  onDeclined: () => void;
  /** The version no longer waits for the owner, or is gone: the page closes the dialog, says so and reads again. */
  onReload: () => void;
};

/** What the last rejection left on screen. */
type RejectState = { outcome: OwnerRejectOutcome | null; round: number };

const INITIAL: RejectState = { outcome: null, round: 0 };

/** The server's bound on the reason, in UTF-16 units as the field counts them (brokerage-agreement S5-D7, S4-D3). */
const REASON_MAX = 500;

const REFUSAL_TEXT = {
  tooMany: "owner.errors.tooMany",
  concurrent: "owner.errors.concurrent",
} as const satisfies Record<string, EligibilityKey>;

/**
 * "Decline" of one version (brokerage-agreement US-2 AC-3, S5-D7): an optional private reason, then "Decline" or "Keep
 * it". It sends one request per click and asks no password. The reason is checked by the server only (E05S5-P7): its
 * refusal of the characters shows on the field. A 204 hands back, so the page reads the list again.
 */
export function OwnerRejectDialog({ agreementId, versionNo, onClose, onDeclined, onReload }: OwnerRejectDialogProps) {
  const t = useTranslations("BrokerageAgreement");
  const fieldId = useId();
  const [reason, setReason] = useState("");

  /** Set when "Decline" is pressed, cleared when its action ends: a click meanwhile is not even queued. */
  const sending = useRef(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const [state, dispatch, pending] = useActionState(async (prev: RejectState, reasonText: string): Promise<RejectState> => {
    const round = prev.round + 1;
    try {
      const outcome = await rejectVersion(agreementId, versionNo, reasonText);
      if (outcome.kind === "declined") onDeclined();
      if (outcome.kind === "refused" && outcome.reason === "reload") onReload();
      return { outcome, round };
    } catch {
      return { outcome: { kind: "failed" }, round };
    } finally {
      sending.current = false;
    }
  }, INITIAL);

  const submit = () => {
    if (sending.current || state.outcome?.kind === "declined") return;
    sending.current = true;
    dispatch(reason);
  };

  // After a refusal the message takes the focus.
  useEffect(() => {
    const { outcome } = state;
    if (state.round === 0 || outcome === null || outcome.kind === "declined") return;
    if (outcome.kind === "refused" && (outcome.reason === "badReason" || outcome.reason === "reload")) return;
    messageRef.current?.focus();
  }, [state]);

  const { outcome } = state;
  const busy = pending || outcome?.kind === "declined";
  const close = () => {
    if (!busy) onClose();
  };
  const badReason = outcome?.kind === "refused" && outcome.reason === "badReason";
  const reasonError = badReason ? t("owner.errors.badReason") : undefined;

  let message: ReactNode = null;
  if (outcome?.kind === "refused" && (outcome.reason === "tooMany" || outcome.reason === "concurrent")) {
    message = (
      <Alert tone="error">
        <p>{t(REFUSAL_TEXT[outcome.reason])}</p>
      </Alert>
    );
  } else if (outcome?.kind === "failed") {
    message = (
      <Alert tone="error">
        <p>{t("owner.errors.failed")}</p>
        {outcome.correlationId !== undefined && (
          <p className="mt-1 text-xs">{t("owner.supportCode", { correlationId: outcome.correlationId })}</p>
        )}
      </Alert>
    );
  }

  return (
    <Dialog open onClose={close} title={t("owner.declineDialog.title", { number: versionNo })}>
      <form action={submit} noValidate className="space-y-4">
        {message !== null && (
          <div ref={messageRef} tabIndex={-1} className="outline-none">
            {message}
          </div>
        )}
        <FormField id={fieldId} label={t("owner.declineDialog.reason")} optional error={reasonError}>
          <Textarea
            id={fieldId}
            name="reason"
            rows={3}
            maxLength={REASON_MAX}
            value={reason}
            invalid={badReason}
            aria-describedby={describedBy(fieldId, reasonError)}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={close}>
            {t("owner.declineDialog.keep")}
          </Button>
          <SubmitButton fullWidth={false} disabled={busy}>
            {t("owner.declineDialog.submit")}
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
