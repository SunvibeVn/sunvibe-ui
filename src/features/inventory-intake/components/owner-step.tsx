"use client";

import { useTranslations } from "next-intl";
import { useActionState, useCallback, useId, useLayoutEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

import type { StepMode } from "../lib/intake-steps";
import { codeIssued, NO_CODE, OWNER_EMAIL_MAX, type OwnerCodeState, ownerEmailProblem, ownerStateKey } from "../lib/owner-code-state";
import { askOwnerConfirmation } from "../services/intake-api";

import { COMMAND_IDLE, type CommandState, useIntake, useIntakeCommand, useIntakeLock } from "./intake-context";
import { IntakeMessage } from "./intake-message";
import { OwnerCodePanel } from "./owner-code-panel";
import { StepCard } from "./step-card";
import { usePageHide } from "./use-page-hide";

type OwnerFormState = CommandState & { problem: "required" | "invalid" | null };

const INITIAL: OwnerFormState = { ...COMMAND_IDLE, problem: null };

/**
 * The owner request (spec 4.6). The address and the code stay in this component's memory: no draft, no storage. Whatever
 * address is typed, the page reads the same.
 */
export function OwnerStep({ mode }: { mode: StepMode }) {
  const t = useTranslations("InventoryIntake");
  const { leadId, block, reload, busy } = useIntake();
  const run = useIntakeCommand();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<OwnerCodeState>(NO_CODE);
  const emailId = useId();

  const forget = useCallback(() => {
    setCode(NO_CODE);
    setEmail("");
  }, []);
  usePageHide(forget);
  // Next keeps a route hidden (Activity) after navigating away: a code must not come back with Back.
  useLayoutEffect(() => forget, [forget]);

  const [state, dispatch, pending] = useActionState(async (): Promise<OwnerFormState> => {
    const problem = ownerEmailProblem(email);
    if (problem !== null) return { ...COMMAND_IDLE, problem };
    const body = { ownerEmail: email.trim(), expectedVersion: block.version ?? undefined };
    const outcome = await run(
      () => askOwnerConfirmation(leadId, body),
      async (answer) => {
        setCode(codeIssued(answer));
        setEmail("");
        await reload();
      },
    );
    return { ...outcome, problem: null };
  }, INITIAL);
  useIntakeLock("owner", pending);

  const refused = state.fields.includes("ownerEmail");
  const emailError = state.problem !== null ? t(`owner.problems.${state.problem}`) : refused ? t("owner.problems.invalid") : undefined;

  return (
    <StepCard title={t("owner.title")}>
      <p className="text-sm text-slate-700">{t(ownerStateKey(block.ownerState))}</p>
      {code.kind === "shown" && <OwnerCodePanel value={code} onDone={() => setCode(NO_CODE)} />}
      {mode === "act" && (
        <form action={dispatch} noValidate className="space-y-3">
          {state.message !== null && <IntakeMessage value={state.message} />}
          <p className="text-sm text-slate-600">{t("owner.intro")}</p>
          <fieldset disabled={pending} className="max-w-md">
            <FormField id={emailId} label={t("owner.email")} required error={emailError} hint={t("owner.emailHint")}>
              <Input
                id={emailId}
                type="text"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={OWNER_EMAIL_MAX}
                value={email}
                invalid={emailError !== undefined}
                aria-required
                aria-describedby={describedBy(emailId, emailError, true)}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FormField>
          </fieldset>
          <Button type="submit" pending={pending} disabled={busy}>
            {pending ? t("owner.saving") : t("owner.submit")}
          </Button>
        </form>
      )}
    </StepCard>
  );
}
