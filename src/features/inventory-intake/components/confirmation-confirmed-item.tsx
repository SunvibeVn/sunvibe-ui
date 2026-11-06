"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId } from "react";

import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

import {
  type ConfirmationFormState,
  type ConfirmationItemView,
  FORM_IDLE,
  formStateAfter,
  formText,
  passwordProblem,
  phraseProblem,
  runConfirmation,
} from "../lib/confirmation-flow";
import { enterCheckPhrase, withdrawConfirmation } from "../services/confirmations-api";

import { ConfirmationFacts } from "./confirmation-facts";
import { ConfirmationMessage } from "./confirmation-message";
import type { ItemActions } from "./confirmation-pending-item";

type FieldState = ConfirmationFormState & { problem: "required" | "invalid" | null };

const IDLE: FieldState = { ...FORM_IDLE, problem: null };

type ConfirmedProps = { item: Extract<ConfirmationItemView, { kind: "confirmed" }>; actions: ItemActions };

/** A confirmed request: its details, the phrase while a check is open (U-10), and the withdrawal. */
export function ConfirmationConfirmedItem({ item, actions }: ConfirmedProps) {
  const t = useTranslations("InventoryIntake");
  return (
    <li className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-navy-950">{t("account.confirmedTitle")}</h2>
      {item.details !== null && <ConfirmationFacts details={item.details} />}
      {item.asksForPhrase ? (
        <PhraseForm requestId={item.requestId} actions={actions} />
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{t("account.phraseWaiting")}</p>
          <Button
            variant="secondary"
            onClick={() => {
              void actions.reload().then((read) => {
                if (!read) actions.onMoved({ key: "account.errors.retry" });
              });
            }}
          >
            {t("account.checkAgain")}
          </Button>
        </div>
      )}
      <WithdrawForm requestId={item.requestId} actions={actions} />
    </li>
  );
}

/** Asks for what the caller read out. The page has no phrase to show: it holds only what the owner types, until the submit. */
function PhraseForm({ requestId, actions }: { requestId: string; actions: ItemActions }) {
  const t = useTranslations("InventoryIntake");
  const phraseId = useId();

  const [state, dispatch, pending] = useActionState<FieldState, FormData>(async (_previous, data) => {
    const phrase = formText(data, "phrase").trim();
    const problem = phraseProblem(phrase);
    if (problem !== null) return { ...IDLE, problem };
    const step = await runConfirmation({ send: () => enterCheckPhrase(requestId, { phrase }), isCurrent: actions.isCurrent });
    if (step.kind === "done") {
      actions.onDone("account.done.checked");
      await actions.reload();
      return IDLE;
    }
    if (step.kind === "message" && step.reload) {
      actions.onMoved(step.message);
      await actions.reload();
      return IDLE;
    }
    return { ...formStateAfter(step), problem: null };
  }, IDLE);

  const phraseError = state.problem === null ? undefined : t(`account.problems.${state.problem}`);
  useEffect(() => {
    if (state.problem !== null) document.getElementById(phraseId)?.focus();
  }, [state, phraseId]);

  return (
    <form action={dispatch} noValidate className="space-y-3 rounded-lg border border-violet-200 bg-violet-50 p-4">
      <h3 className="text-sm font-semibold text-violet-900">{t("account.phraseTitle")}</h3>
      <p className="text-sm text-violet-900">{t("account.phraseIntro")}</p>
      {state.message !== null && <ConfirmationMessage value={state.message} />}
      <fieldset disabled={pending}>
        <FormField id={phraseId} label={t("account.phrase")} required error={phraseError}>
          <Input
            compact
            id={phraseId}
            name="phrase"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={32}
            invalid={phraseError !== undefined}
            aria-required
            aria-describedby={describedBy(phraseId, phraseError)}
          />
        </FormField>
      </fieldset>
      <Button type="submit" pending={pending}>
        {pending ? t("account.entering") : t("account.submitPhrase")}
      </Button>
    </form>
  );
}

function WithdrawForm({ requestId, actions }: { requestId: string; actions: ItemActions }) {
  const t = useTranslations("InventoryIntake");
  const passwordId = useId();

  const [state, dispatch, pending] = useActionState<FieldState, FormData>(async (_previous, data) => {
    const currentPassword = formText(data, "currentPassword");
    // React keeps the last payload of an action: it holds no password from here on.
    data.delete("currentPassword");
    const problem = passwordProblem(currentPassword);
    if (problem !== null) return { ...IDLE, problem };
    const step = await runConfirmation({ send: () => withdrawConfirmation(requestId, { currentPassword }), isCurrent: actions.isCurrent });
    if (step.kind === "done") {
      actions.onDone("account.done.withdrawn");
      await actions.reload();
      return IDLE;
    }
    if (step.kind === "message" && step.reload) {
      actions.onMoved(step.message);
      await actions.reload();
      return IDLE;
    }
    return { ...formStateAfter(step), problem: null };
  }, IDLE);

  const passwordError =
    state.problem !== null ? t(`account.problems.${state.problem}`) : state.passwordProblem === null ? undefined : t(state.passwordProblem);
  useEffect(() => {
    if (state.problem !== null || state.passwordProblem !== null) document.getElementById(passwordId)?.focus();
  }, [state, passwordId]);

  return (
    <form action={dispatch} noValidate className="space-y-3 border-t border-slate-100 pt-4">
      <h3 className="text-sm font-semibold text-slate-900">{t("account.withdrawTitle")}</h3>
      <p className="text-sm text-slate-600">{t("account.withdrawIntro")}</p>
      {state.message !== null && <ConfirmationMessage value={state.message} />}
      <fieldset disabled={pending}>
        <FormField id={passwordId} label={t("account.password")} required error={passwordError}>
          <PasswordInput
            compact
            id={passwordId}
            name="currentPassword"
            autoComplete="current-password"
            invalid={passwordError !== undefined}
            aria-required
            aria-describedby={describedBy(passwordId, passwordError)}
          />
        </FormField>
      </fieldset>
      <Button type="submit" variant="secondary" pending={pending}>
        {pending ? t("account.withdrawing") : t("account.withdraw")}
      </Button>
    </form>
  );
}
