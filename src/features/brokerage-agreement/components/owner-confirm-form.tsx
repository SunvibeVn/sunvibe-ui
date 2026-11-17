"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useActionState, useEffect, useId, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";

import { type OwnerConfirmOutcome, confirmVersions } from "../lib/owner-confirm-flow";
import { confirmBody, type VersionKey } from "../lib/owner-confirm-form";
import type { EligibilityKey } from "../lib/reason-text";
import type { BrokerageAgreementConfirmationRequest } from "../types";

type OwnerConfirmFormProps = {
  /** The ticked versions, in tick order: 1 to 20 (brokerage-agreement S5-D5). */
  ticked: readonly VersionKey[];
  /** The statement version the owner read, sent back with the confirmation (S5-D3). */
  statementVersion: string | null;
  /** The unit code of a ticked agreement, for the line of a version that cannot be confirmed now. */
  unitCodeOf: (agreementId: string) => string | null;
  /** A 204: the page reads the list again. */
  onConfirmed: () => void;
  /** The page is out of date (404, a version no longer waiting, a changed statement): the page says so and reads again. */
  onReload: () => void;
};

/** What the last confirmation left on screen. */
type ConfirmState = { outcome: OwnerConfirmOutcome | null; round: number };

const INITIAL: ConfirmState = { outcome: null, round: 0 };

/** The server's bound on the password (brokerage-agreement spec section 4). */
const PASSWORD_MAX = 256;

const REFUSAL_TEXT = {
  locked: "owner.errors.locked",
  tooMany: "owner.errors.tooMany",
  concurrent: "owner.errors.concurrent",
} as const satisfies Record<string, EligibilityKey>;

/**
 * The confirmation below the list (brokerage-agreement US-2 AC-2, AC-4, S5-D4, S5-D5): the current password and "Confirm
 * the selected versions (k)", one request per click. The password is read from this field only, sent once, never stored,
 * logged or shown, and cleared after any answer (BR-17). Each refusal is read by its code: a wrong password on the field,
 * the lock, the rate limit, the versions that cannot be confirmed now with their reasons, a change at the same time; a
 * page out of date hands back to the page.
 */
export function OwnerConfirmForm({ ticked, statementVersion, unitCodeOf, onConfirmed, onReload }: OwnerConfirmFormProps) {
  const t = useTranslations("BrokerageAgreement");
  const fieldId = useId();
  const [password, setPassword] = useState("");

  /** Set when "Confirm" is pressed, cleared when its action ends: a click meanwhile is not even queued. */
  const sending = useRef(false);
  const messageRef = useRef<HTMLDivElement>(null);
  const body = confirmBody({ ticked: [...ticked], password }, statementVersion);

  const [state, dispatch, pending] = useActionState(async (prev: ConfirmState, request: BrokerageAgreementConfirmationRequest): Promise<ConfirmState> => {
    const round = prev.round + 1;
    try {
      const outcome = await confirmVersions(request);
      if (outcome.kind === "confirmed") onConfirmed();
      if (outcome.kind === "refused" && outcome.reason === "reload") onReload();
      return { outcome, round };
    } catch {
      return { outcome: { kind: "failed" }, round };
    } finally {
      // After any answer the password is gone from the page.
      setPassword("");
      sending.current = false;
    }
  }, INITIAL);

  const submit = () => {
    if (sending.current || body === null) return;
    sending.current = true;
    dispatch(body);
  };

  // After a refusal the message takes the focus; a wrong password leaves it on the field.
  useEffect(() => {
    const { outcome } = state;
    if (state.round === 0 || outcome === null || outcome.kind === "confirmed") return;
    if (outcome.kind === "refused" && (outcome.reason === "wrongPassword" || outcome.reason === "reload")) return;
    messageRef.current?.focus();
  }, [state]);

  const { outcome } = state;
  const wrongPassword = outcome?.kind === "refused" && outcome.reason === "wrongPassword";
  const passwordError = wrongPassword ? t("owner.errors.wrongPassword") : undefined;

  let message: ReactNode = null;
  if (outcome?.kind === "refused" && outcome.reason === "notEligible") {
    message = (
      <Alert tone="error">
        {outcome.items.map((item) => {
          const code = unitCodeOf(item.agreementId);
          return (
            <div key={`${item.agreementId}:${item.versionNo}`} className="mb-2">
              <p className="font-medium">
                {code === null
                  ? t("owner.errors.notEligibleNoCode", { number: item.versionNo })
                  : t("owner.errors.notEligible", { number: item.versionNo, code })}
              </p>
              {item.groupKeys.map((key, index) => (
                <p key={`${index}:${key}`} className="mt-0.5">
                  {t(key)}
                </p>
              ))}
            </div>
          );
        })}
        <p>{t("owner.errors.contact")}</p>
      </Alert>
    );
  } else if (outcome?.kind === "refused" && outcome.reason !== "wrongPassword" && outcome.reason !== "reload") {
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
    <form action={submit} noValidate className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      {message !== null && (
        <div ref={messageRef} tabIndex={-1} className="outline-none">
          {message}
        </div>
      )}
      <FormField id={fieldId} label={t("owner.password")} error={passwordError}>
        <PasswordInput
          id={fieldId}
          name="currentPassword"
          autoComplete="current-password"
          maxLength={PASSWORD_MAX}
          value={password}
          invalid={wrongPassword}
          aria-describedby={describedBy(fieldId, passwordError)}
          onChange={(event) => setPassword(event.target.value)}
        />
      </FormField>
      <SubmitButton fullWidth={false} disabled={body === null || pending}>
        {t("owner.confirm", { count: ticked.length })}
      </SubmitButton>
    </form>
  );
}
