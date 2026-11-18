"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useActionState, useEffect, useRef } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

import { type DraftOpenOutcome, openDraft } from "../lib/draft-open-flow";
import type { EligibilityKey } from "../lib/reason-text";

type DraftOpenNoticeProps = {
  agreementId: string;
  /** The data version the page read, sent back as `expectedDataVersion` (brokerage-agreement BR-5, S5-D10). */
  dataVersion: number;
  /** A 204: the page reads the agreement again and shows the new draft. */
  onOpened: () => void;
  /** A version is still pending: the page says so and reads the agreement again. */
  onNotAllowed: () => void;
  /** "Reload" after a change made meanwhile: the page reads the agreement again. */
  onReload: () => void;
};

/** What the last request left on screen. */
type OpenState = { outcome: DraftOpenOutcome | null; round: number };

const INITIAL: OpenState = { outcome: null, round: 0 };

const REFUSAL_TEXT = {
  stale: "newDraft.errors.stale",
  notAssignee: "newDraft.errors.notAssignee",
  notFound: "newDraft.errors.notFound",
} as const satisfies Record<string, EligibilityKey>;

/**
 * "Open a new draft" on the staff page (brokerage-agreement US-2 AC-3, US-3 AC-3, AC-4, BR-5, S5-D10, S6-D24): why it is
 * offered, in words true after each cause (the latest version did not take effect; its line in the list says why), then
 * the button that opens version n+1, a copy of the latest version, with the data version the page read. One request per
 * click. A refusal stays here, read by its code as the send dialog reads its own (S4-D11); a pending version hands back
 * so the page reloads.
 */
export function DraftOpenNotice({ agreementId, dataVersion, onOpened, onNotAllowed, onReload }: DraftOpenNoticeProps) {
  const t = useTranslations("BrokerageAgreement");

  /** Set when the button is pressed, cleared when its action ends: a click meanwhile is not even queued. */
  const sending = useRef(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const [state, dispatch] = useActionState(async (prev: OpenState): Promise<OpenState> => {
    const round = prev.round + 1;
    try {
      const outcome = await openDraft(agreementId, dataVersion);
      if (outcome.kind === "opened") onOpened();
      if (outcome.kind === "refused" && outcome.reason === "notAllowed") onNotAllowed();
      return { outcome, round };
    } catch {
      return { outcome: { kind: "failed" }, round };
    } finally {
      sending.current = false;
    }
  }, INITIAL);

  const submit = () => {
    if (sending.current || state.outcome?.kind === "opened") return;
    sending.current = true;
    dispatch();
  };

  // After a refusal the message takes the focus.
  useEffect(() => {
    const { outcome } = state;
    if (state.round === 0 || outcome === null || outcome.kind === "opened") return;
    if (outcome.kind === "refused" && outcome.reason === "notAllowed") return;
    messageRef.current?.focus();
  }, [state]);

  const { outcome } = state;
  let message: ReactNode = null;
  if (outcome?.kind === "refused" && outcome.reason === "notEligible") {
    message = (
      <Alert tone="error">
        <p>{t("newDraft.errors.notEligible")}</p>
        {outcome.groupKeys.map((key, index) => (
          <p key={`${index}:${key}`} className="mt-1">
            {t(key)}
          </p>
        ))}
      </Alert>
    );
  } else if (outcome?.kind === "refused" && outcome.reason !== "notAllowed") {
    message = (
      <Alert tone="error">
        <p>{t(REFUSAL_TEXT[outcome.reason])}</p>
        {outcome.reason === "stale" && (
          <Button variant="secondary" className="mt-2 px-4 py-2" onClick={onReload}>
            {t("newDraft.reload")}
          </Button>
        )}
      </Alert>
    );
  } else if (outcome?.kind === "failed") {
    message = (
      <Alert tone="error">
        <p>{t("newDraft.errors.failed")}</p>
        {outcome.correlationId !== undefined && (
          <p className="mt-1 text-xs">{t("newDraft.supportCode", { code: outcome.correlationId })}</p>
        )}
      </Alert>
    );
  }

  return (
    <form action={submit} noValidate className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      {message !== null && (
        <div ref={messageRef} tabIndex={-1} className="outline-none">
          {message}
        </div>
      )}
      <p className="text-sm text-slate-800">{t("newDraft.notice")}</p>
      <SubmitButton fullWidth={false} disabled={outcome?.kind === "opened"}>
        {t("newDraft.open")}
      </SubmitButton>
    </form>
  );
}
