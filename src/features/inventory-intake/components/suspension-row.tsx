"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format/vietnam-time";

import { REASON_MAX, type TextProblem } from "../lib/intake-text";
import { releaseBody, releaseProblem, type SuspensionRow as Row } from "../lib/suspension-form";
import { releaseSuspension } from "../services/intake-api";

import { COMMAND_IDLE, type CommandState, useIntake, useIntakeCommand, useIntakeLock } from "./intake-context";
import { IntakeMessage } from "./intake-message";

type ReleaseState = CommandState & { problem: TextProblem | null };

const INITIAL: ReleaseState = { ...COMMAND_IDLE, problem: null };

/** One active suspension, and the release that ends it. */
export function SuspensionRow({ row }: { row: Row }) {
  const t = useTranslations("InventoryIntake");
  const { leadId, block, apply, busy } = useIntake();
  const run = useIntakeCommand();
  const [reason, setReason] = useState("");
  const reasonId = useId();

  const [state, dispatch, pending] = useActionState(async (): Promise<ReleaseState> => {
    const problem = releaseProblem(reason);
    if (problem !== null) return { ...COMMAND_IDLE, problem };
    const outcome = await run(() => releaseSuspension(leadId, row.id ?? "", releaseBody(reason, block)), apply);
    return { ...outcome, problem: null };
  }, INITIAL);
  useIntakeLock(`release-${row.id}`, pending);

  const reasonError = state.problem === null ? undefined : t(`text.${state.problem}`);

  return (
    <li className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
      <p className="font-medium text-slate-900">{row.unitCode ?? t("suspensions.wholeLead")}</p>
      {row.reason !== null && <p className="break-words text-slate-700">{row.reason}</p>}
      {row.createdAt !== null && <p className="text-xs text-slate-500">{t("suspensions.recorded", { date: formatDateTime(row.createdAt) })}</p>}
      <form action={dispatch} noValidate className="space-y-2">
        {state.message !== null && <IntakeMessage value={state.message} />}
        <fieldset disabled={pending} className="max-w-md">
          <FormField id={reasonId} label={t("suspensions.releaseReason")} required error={reasonError}>
            <Input
              compact
              id={reasonId}
              autoComplete="off"
              maxLength={REASON_MAX * 2}
              value={reason}
              invalid={reasonError !== undefined}
              aria-required
              aria-describedby={describedBy(reasonId, reasonError)}
              onChange={(event) => setReason(event.target.value)}
            />
          </FormField>
        </fieldset>
        <Button type="submit" variant="secondary" pending={pending} disabled={busy}>
          {pending ? t("suspensions.releasing") : t("suspensions.release")}
        </Button>
      </form>
    </li>
  );
}
