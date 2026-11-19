"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";

import { cancel } from "../lib/cancellation-flow";
import type { StopOutcome } from "../lib/suspension-flow";

import { StopOutcomeNotice } from "./stop-outcome-notice";

type CancellationDialogProps = {
  agreementId: string;
  /** The data version the page read, sent back as `expectedDataVersion` (brokerage-agreement BR-5, S8-D7). */
  dataVersion: number;
  /** "Keep it", Esc or the backdrop, while no request runs: the section closes the dialog. */
  onClose: () => void;
  /** A 204: the section closes the dialog and the page reads the agreement again. */
  onDone: () => void;
  /** A 403 or another 409 (AGREEMENT_TOOK_EFFECT among them): the section closes the dialog, the page reads again. */
  onChanged: (code: string) => void;
  /** "Reload" after a change made at the same time: the page reads the agreement again. */
  onReload: () => void;
};

type CancelState = { outcome: StopOutcome | null; round: number };

const INITIAL: CancelState = { outcome: null, round: 0 };

/**
 * "Cancel the agreement" (brokerage-agreement US-1 AC-5, BR-5, S8-D7): what cancelling means, then "Cancel the
 * agreement" or "Keep it". One request per click, with the data version the page read; no reason. Only the lead's
 * assigned Sale may cancel, and only an agreement that never took effect: the server decides, and its refusal is read
 * by code (one that took effect is ended instead).
 */
export function CancellationDialog({ agreementId, dataVersion, onClose, onDone, onChanged, onReload }: CancellationDialogProps) {
  const t = useTranslations("BrokerageAgreement");

  /** Set when "Cancel the agreement" is pressed, cleared when its action ends: a click meanwhile is not even queued. */
  const sending = useRef(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const [state, dispatch, pending] = useActionState(async (prev: CancelState): Promise<CancelState> => {
    const round = prev.round + 1;
    try {
      const outcome = await cancel(agreementId, { dataVersion });
      if (outcome.kind === "done") onDone();
      if (outcome.kind === "changed") onChanged(outcome.code);
      return { outcome, round };
    } catch {
      return { outcome: { kind: "failed" }, round };
    } finally {
      sending.current = false;
    }
  }, INITIAL);

  const { outcome } = state;
  const handedBack = outcome?.kind === "done" || outcome?.kind === "changed";
  const busy = pending || handedBack;

  const submit = () => {
    if (sending.current || handedBack) return;
    sending.current = true;
    dispatch();
  };

  // After an answer its message takes the focus.
  useEffect(() => {
    if (state.round > 0) messageRef.current?.focus();
  }, [state]);

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Dialog open onClose={close} title={t("stop.cancelDialog.title")}>
      <form action={submit} noValidate className="space-y-4">
        {/* A 400 here names only the data version, which the reader cannot fix: the failure line. */}
        <StopOutcomeNotice ref={messageRef} outcome={outcome} otherFields onReload={onReload} />
        <p className="text-slate-800">{t("stop.cancelDialog.body")}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={close}>
            {t("stop.cancelDialog.keep")}
          </Button>
          <SubmitButton fullWidth={false} disabled={busy}>
            {t("stop.cancelDialog.submit")}
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
