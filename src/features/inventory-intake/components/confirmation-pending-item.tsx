"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useLayoutEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { formatDateTime } from "@/lib/format/vietnam-time";

import {
  closesDetails,
  codeProblem,
  type ConfirmationFormState,
  type ConfirmationItemView,
  type ConfirmationMessage as Message,
  type ConfirmationStep,
  FORM_IDLE,
  formStateAfter,
  formText,
  passwordProblem,
  runConfirmation,
} from "../lib/confirmation-flow";
import type { IntakeKey } from "../lib/labels";
import { confirmOwner, declineConfirmation, readConfirmationDetails } from "../services/confirmations-api";
import type { OwnerConfirmationDetails } from "../types";

import { ConfirmationFacts } from "./confirmation-facts";
import { ConfirmationMessage } from "./confirmation-message";

/** What an item needs from the list. */
export type ItemActions = {
  isCurrent(): boolean;
  /** Reads the list again; false when the read failed. */
  reload(): Promise<boolean>;
  /** The list moved: the message outlives this item. */
  onMoved(message: Message): void;
  onDone(key: IntakeKey): void;
};

type CodeState = ConfirmationFormState & { problem: "required" | "invalid" | null };

const CODE_IDLE: CodeState = { ...FORM_IDLE, problem: null };

/** The code in hand and what it opened; only in this component's memory. */
type Opened = { code: string; details: OwnerConfirmationDetails };

/** A request before its code (U-8): that it exists, when it ends, and the field for the code. */
export function ConfirmationPendingItem({ item, actions }: { item: Extract<ConfirmationItemView, { kind: "pending" }>; actions: ItemActions }) {
  const t = useTranslations("InventoryIntake");
  const [opened, setOpened] = useState<Opened | null>(null);

  // Next keeps this route hidden (Activity): the code and the address do not come back with Back.
  useLayoutEffect(() => () => setOpened(null), []);

  return (
    <li className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-navy-950">{t("account.pendingTitle")}</h2>
        {item.expiresAt !== null && <p className="text-sm text-slate-600">{t("account.ends", { date: formatDateTime(item.expiresAt) })}</p>}
      </div>
      {opened === null ? (
        <CodeForm requestId={item.requestId} actions={actions} onOpened={setOpened} />
      ) : (
        <DetailsForm requestId={item.requestId} opened={opened} actions={actions} onClose={() => setOpened(null)} />
      )}
    </li>
  );
}

type CodeFormProps = { requestId: string; actions: ItemActions; onOpened(opened: Opened): void };

function CodeForm({ requestId, actions, onOpened }: CodeFormProps) {
  const t = useTranslations("InventoryIntake");
  const codeId = useId();

  const [state, dispatch, pending] = useActionState<CodeState, FormData>(async (_previous, data) => {
    const code = formText(data, "code").trim();
    const problem = codeProblem(code);
    if (problem !== null) return { ...CODE_IDLE, problem };
    const step = await runConfirmation({ send: () => readConfirmationDetails(requestId, { code }), isCurrent: actions.isCurrent });
    if (step.kind === "done") onOpened({ code, details: step.data });
    if (step.kind === "message" && step.reload) {
      actions.onMoved(step.message);
      await actions.reload();
      return CODE_IDLE;
    }
    return { ...formStateAfter(step), problem: null };
  }, CODE_IDLE);

  const codeError = state.problem === null ? undefined : t(`account.problems.${state.problem}`);
  useEffect(() => {
    if (state.problem !== null) document.getElementById(codeId)?.focus();
  }, [state, codeId]);

  return (
    <form action={dispatch} noValidate className="space-y-3">
      {state.message !== null && <ConfirmationMessage value={state.message} />}
      <fieldset disabled={pending}>
        <FormField id={codeId} label={t("account.code")} required error={codeError} hint={t("account.codeHint")}>
          <Input
            compact
            id={codeId}
            name="code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={32}
            invalid={codeError !== undefined}
            aria-required
            aria-describedby={describedBy(codeId, codeError, true)}
          />
        </FormField>
      </fieldset>
      <Button type="submit" pending={pending}>
        {pending ? t("account.reading") : t("account.readDetails")}
      </Button>
    </form>
  );
}

type DetailsFormProps = { requestId: string; opened: Opened; actions: ItemActions; onClose(): void };

type DetailsState = ConfirmationFormState & { empty: boolean };

const DETAILS_IDLE: DetailsState = { ...FORM_IDLE, empty: false };

type Answer = { kind: "confirm"; data: FormData } | { kind: "decline" };

/**
 * The details, the statement, and the two answers (spec 4.6 step 4). The password stays in the field until the submit. The
 * form has an action of its own, so no way of submitting it can fall back to a native GET, which would put the password in
 * the address bar.
 */
function DetailsForm({ requestId, opened, actions, onClose }: DetailsFormProps) {
  const t = useTranslations("InventoryIntake");
  const passwordId = useId();
  const { code, details } = opened;
  const statementVersion = details.statement?.version ?? "";

  const settle = async (step: ConfirmationStep<undefined>, done: IntakeKey): Promise<DetailsState> => {
    if (step.kind === "done") {
      actions.onDone(done);
      await actions.reload();
      return DETAILS_IDLE;
    }
    if (step.kind === "message" && closesDetails(step)) {
      actions.onMoved(step.message);
      onClose();
      await actions.reload();
      return DETAILS_IDLE;
    }
    return { ...formStateAfter(step), empty: false };
  };

  const [state, answer, pending] = useActionState<DetailsState, Answer>(async (_previous, chosen) => {
    if (chosen.kind === "decline") {
      const step = await runConfirmation({ send: () => declineConfirmation(requestId, { code }), isCurrent: actions.isCurrent });
      return settle(step, "account.done.declined");
    }
    const currentPassword = formText(chosen.data, "currentPassword");
    // React keeps the last payload of an action: it holds no password from here on.
    chosen.data.delete("currentPassword");
    if (passwordProblem(currentPassword) !== null) return { ...DETAILS_IDLE, empty: true };
    const step = await runConfirmation({
      send: () => confirmOwner(requestId, { code, currentPassword, statementVersion }),
      isCurrent: actions.isCurrent,
    });
    return settle(step, "account.done.confirmed");
  }, DETAILS_IDLE);

  const passwordError = state.empty ? t("account.problems.required") : state.passwordProblem === null ? undefined : t(state.passwordProblem);
  useEffect(() => {
    if (state.empty || state.passwordProblem !== null) document.getElementById(passwordId)?.focus();
  }, [state, passwordId]);

  return (
    <form action={(data) => answer({ kind: "confirm", data })} noValidate className="space-y-4">
      {state.message !== null && <ConfirmationMessage value={state.message} />}
      <ConfirmationFacts details={details} />
      {details.statement?.text && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t("account.statement")}</h3>
          <p className="mt-1 text-sm text-slate-700">{details.statement.text}</p>
        </div>
      )}
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
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t("account.confirm")}
        </Button>
        <Button type="submit" variant="secondary" formAction={() => answer({ kind: "decline" })} disabled={pending}>
          {t("account.decline")}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          {t("account.backToCode")}
        </Button>
        {pending && (
          <span role="status" className="text-sm text-slate-600">
            {t("account.saving")}
          </span>
        )}
      </div>
    </form>
  );
}
