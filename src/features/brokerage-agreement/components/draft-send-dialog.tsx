"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useActionState, useEffect, useRef } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";

import { type DraftSendOutcome, sendDraft } from "../lib/draft-send-flow";
import type { EligibilityKey } from "../lib/reason-text";

type DraftSendDialogProps = {
  agreementId: string;
  /** The number of the draft version this dialog sends. */
  versionNo: number;
  /** The data version the page read, sent back as `expectedDataVersion` (brokerage-agreement BR-5, S4-D2). */
  dataVersion: number;
  /** "Keep editing", Esc or the backdrop, while no send runs: the page closes the dialog. */
  onClose: () => void;
  /** A 204: the page closes the dialog and reads the agreement again. */
  onSent: () => void;
  /** "Reload" after a change made meanwhile: the page reads the agreement again. */
  onReload: () => void;
};

/** What the last send left on screen. */
type SendState = { outcome: DraftSendOutcome | null; round: number };

const INITIAL: SendState = { outcome: null, round: 0 };

const REFUSAL_TEXT = {
  notDraft: "send.errors.notDraft",
  stale: "send.errors.stale",
  sendingOff: "send.errors.sendingOff",
  notAssignee: "send.errors.notAssignee",
  notFound: "send.errors.notFound",
} as const satisfies Record<string, EligibilityKey>;

/**
 * "Send to the owner" (brokerage-agreement US-1 AC-5, BR-5, S4-D14): what sending does, then "Send" with the data
 * version the page read. It sends one request per click: a click while it runs sends nothing, and "Keep editing" is
 * disabled meanwhile. Every refusal stays in the dialog, read by its code (S4-D11): the missing parts, the reason
 * groups, a change made meanwhile with "Reload", sending switched off on this server (BR-19). A sent version closes it.
 */
export function DraftSendDialog({ agreementId, versionNo, dataVersion, onClose, onSent, onReload }: DraftSendDialogProps) {
  const t = useTranslations("BrokerageAgreement");

  /** Set when "Send" is pressed, cleared when its action ends: a click meanwhile is not even queued. */
  const sending = useRef(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const [state, dispatch, pending] = useActionState(async (prev: SendState): Promise<SendState> => {
    const round = prev.round + 1;
    try {
      const outcome = await sendDraft(agreementId, dataVersion);
      if (outcome.kind === "sent") onSent();
      return { outcome, round };
    } catch {
      return { outcome: { kind: "failed" }, round };
    } finally {
      sending.current = false;
    }
  }, INITIAL);

  const submit = () => {
    if (sending.current || state.outcome?.kind === "sent") return;
    sending.current = true;
    dispatch();
  };

  // After a refusal the message takes the focus.
  useEffect(() => {
    if (state.round > 0 && state.outcome !== null && state.outcome.kind !== "sent") messageRef.current?.focus();
  }, [state]);

  const { outcome } = state;
  const busy = pending || outcome?.kind === "sent";
  const close = () => {
    if (!busy) onClose();
  };

  let message: ReactNode = null;
  if (outcome?.kind === "refused" && outcome.reason === "incomplete") {
    message = (
      <Alert tone="error">
        <p>{t("send.errors.incomplete")}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {outcome.partKeys.map((key, index) => (
            <li key={`${index}:${key}`}>{t(key)}</li>
          ))}
        </ul>
      </Alert>
    );
  } else if (outcome?.kind === "refused" && outcome.reason === "notEligible") {
    message = (
      <Alert tone="error">
        <p>{t("send.errors.notEligible")}</p>
        {outcome.groupKeys.map((key, index) => (
          <p key={`${index}:${key}`} className="mt-1">
            {t(key)}
          </p>
        ))}
      </Alert>
    );
  } else if (outcome?.kind === "refused") {
    message = (
      <Alert tone="error">
        <p>{t(REFUSAL_TEXT[outcome.reason])}</p>
        {outcome.reason === "stale" && (
          <Button variant="secondary" className="mt-2 px-4 py-2" onClick={onReload}>
            {t("send.reload")}
          </Button>
        )}
      </Alert>
    );
  } else if (outcome?.kind === "failed") {
    message = (
      <Alert tone="error">
        <p>{t("send.errors.failed")}</p>
        {outcome.correlationId !== undefined && (
          <p className="mt-1 text-xs">{t("send.supportCode", { code: outcome.correlationId })}</p>
        )}
      </Alert>
    );
  }

  return (
    <Dialog open onClose={close} title={t("send.title")}>
      <form action={submit} noValidate className="space-y-4">
        {message !== null && (
          <div ref={messageRef} tabIndex={-1} className="outline-none">
            {message}
          </div>
        )}
        <p className="text-slate-800">{t("send.body", { number: versionNo })}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={close}>
            {t("send.keepEditing")}
          </Button>
          <SubmitButton fullWidth={false} disabled={busy}>
            {t("send.submit")}
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
