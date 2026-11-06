"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { REASON_MAX, type TextProblem } from "../lib/intake-text";
import { suspendableUnits, suspensionBody, suspensionProblem, suspensionRows } from "../lib/suspension-form";
import { addSuspension } from "../services/intake-api";

import { COMMAND_IDLE, type CommandState, useIntake, useIntakeCommand, useIntakeLock } from "./intake-context";
import { IntakeMessage } from "./intake-message";
import { StepCard } from "./step-card";
import { SuspensionRow } from "./suspension-row";

type AddState = CommandState & { problem: TextProblem | null };

const INITIAL: AddState = { ...COMMAND_IDLE, problem: null };

/** Manual suspensions (spec 4.11): a manager role who is not the assignee; the server decides the rest. */
export function SuspensionsPanel() {
  const t = useTranslations("InventoryIntake");
  const { block, viewer, epoch } = useIntake();
  if (!viewer.manager || viewer.assignee) return null;
  const rows = suspensionRows(block);
  return (
    <StepCard title={t("suspensions.title")}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">{t("suspensions.none")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <SuspensionRow key={row.id} row={row} />
          ))}
        </ul>
      )}
      <SuspensionForm key={epoch} />
    </StepCard>
  );
}

function SuspensionForm() {
  const t = useTranslations("InventoryIntake");
  const { leadId, block, apply, busy } = useIntake();
  const run = useIntakeCommand();
  const [unitId, setUnitId] = useState("");
  const [reason, setReason] = useState("");
  const unitField = useId();
  const reasonField = useId();

  const [state, dispatch, pending] = useActionState(async (): Promise<AddState> => {
    const problem = suspensionProblem(reason);
    if (problem !== null) return { ...COMMAND_IDLE, problem };
    const outcome = await run(() => addSuspension(leadId, suspensionBody({ unitId, reason }, block)), apply);
    return { ...outcome, problem: null };
  }, INITIAL);
  useIntakeLock("suspension", pending);

  const units = suspendableUnits(block);
  const reasonError = state.problem === null ? undefined : t(`text.${state.problem}`);

  return (
    <form action={dispatch} noValidate className="space-y-3">
      {state.message !== null && <IntakeMessage value={state.message} />}
      <fieldset disabled={pending} className="max-w-xl space-y-3">
        {units.length > 0 && (
          <FormField id={unitField} label={t("suspensions.appliesTo")}>
            <Select id={unitField} value={unitId} onChange={(event) => setUnitId(event.target.value)}>
              <option value="">{t("suspensions.wholeLead")}</option>
              {units.map((unit) => (
                <option key={unit.unitId} value={unit.unitId}>
                  {unit.unitCode}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField id={reasonField} label={t("suspensions.reason")} required error={reasonError}>
          <Textarea
            id={reasonField}
            rows={2}
            autoComplete="off"
            maxLength={REASON_MAX * 2}
            value={reason}
            invalid={reasonError !== undefined}
            aria-required
            aria-describedby={describedBy(reasonField, reasonError)}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
      </fieldset>
      <Button type="submit" variant="secondary" pending={pending} disabled={busy}>
        {pending ? t("suspensions.adding") : t("suspensions.add")}
      </Button>
    </form>
  );
}
