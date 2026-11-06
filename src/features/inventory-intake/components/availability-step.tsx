"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { todayInVietnam } from "@/lib/format/vietnam-time";

import {
  availabilityBody,
  type AvailabilityProblems,
  availabilityProblems,
  type AvailabilityRow,
  availabilityRows,
} from "../lib/availability-form";
import type { StepMode } from "../lib/intake-steps";
import { NOTE_MAX } from "../lib/intake-text";
import { AVAILABILITY_STATE_LABEL } from "../lib/labels";
import { selectedSpaces, spaceLabel } from "../lib/selection-form";
import { putAvailability } from "../services/intake-api";
import type { AvailabilityState } from "../types";

import { COMMAND_IDLE, type CommandState, useIntake, useIntakeCommand, useIntakeLock } from "./intake-context";
import { IntakeMessage } from "./intake-message";
import { StepCard } from "./step-card";

const STATES = Object.keys(AVAILABILITY_STATE_LABEL) as AvailabilityState[];

type FormState = CommandState & { problems: AvailabilityProblems };

const INITIAL: FormState = { ...COMMAND_IDLE, problems: {} };

/** What the owner said about each selected part (spec 4.9); the form starts again from a saved row or a changed selection. */
export function AvailabilityStep({ mode }: { mode: StepMode }) {
  const { block, epoch } = useIntake();
  // Someone only reading has nothing typed to keep: each new version shows as it is.
  const reading = mode === "read" ? block.version : "";
  return <AvailabilityForm key={`${epoch}:${block.selection?.spaceIds?.join() ?? ""}:${reading}`} mode={mode} />;
}

function AvailabilityForm({ mode }: { mode: StepMode }) {
  const t = useTranslations("InventoryIntake");
  const { leadId, block, apply, busy } = useIntake();
  const run = useIntakeCommand();
  const [rows, setRows] = useState<AvailabilityRow[]>(() => availabilityRows(block, todayInVietnam()));
  const prefix = useId();

  const [state, dispatch, pending] = useActionState(async (): Promise<FormState> => {
    const problems = availabilityProblems(rows, todayInVietnam());
    if (Object.keys(problems).length > 0) return { ...COMMAND_IDLE, problems };
    const outcome = await run(() => putAvailability(leadId, availabilityBody(rows, block)), apply);
    return { ...outcome, problems: {} };
  }, INITIAL);
  useIntakeLock("availability", pending);

  const fieldId = (spaceId: string, field: string) => `${prefix}-${spaceId}-${field}`;
  // After each refusal: the save sits below a long form, so the field may be scrolled out of view.
  useEffect(() => {
    const [spaceId, found] = Object.entries(state.problems)[0] ?? [];
    if (spaceId === undefined || found === undefined) return;
    const field = found.state !== undefined ? "state" : found.contactedOn !== undefined ? "contactedOn" : "note";
    document.getElementById(`${prefix}-${spaceId}-${field}`)?.focus();
  }, [state, prefix]);

  const patch = (spaceId: string, change: Partial<AvailabilityRow>) =>
    setRows((prev) => prev.map((row) => (row.spaceId === spaceId ? { ...row, ...change } : row)));
  const labels = new Map(selectedSpaces(block).map((space) => [space.spaceId, spaceLabel(space)]));
  const acting = mode === "act";

  return (
    <StepCard title={t("availability.title")}>
      {acting && <p className="text-sm text-slate-600">{t("availability.intro")}</p>}
      <form action={dispatch} noValidate className="space-y-4">
        {state.message !== null && <IntakeMessage value={state.message} />}
        <fieldset disabled={pending || !acting} className="space-y-4">
          {rows.map((row) => {
            const found = state.problems[row.spaceId] ?? {};
            const stateError = found.state === undefined ? undefined : t(`availability.problems.${found.state}`);
            const dayError = found.contactedOn === undefined ? undefined : t(`availability.problems.${found.contactedOn}`);
            const noteError = found.note === undefined ? undefined : t(`availability.problems.${found.note}`);
            const stateId = fieldId(row.spaceId, "state");
            const dayId = fieldId(row.spaceId, "contactedOn");
            const noteId = fieldId(row.spaceId, "note");
            const expectedId = fieldId(row.spaceId, "expectedDate");
            return (
              <fieldset key={row.spaceId} className="min-w-0 space-y-3 rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-sm font-semibold break-words text-slate-900">{labels.get(row.spaceId)}</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField id={stateId} label={t("availability.state")} required error={stateError}>
                    <Select
                      compact
                      id={stateId}
                      value={row.state}
                      invalid={stateError !== undefined}
                      aria-required
                      aria-describedby={describedBy(stateId, stateError)}
                      onChange={(event) => patch(row.spaceId, { state: event.target.value as AvailabilityRow["state"] })}
                    >
                      <option value="">{t("availability.statePlaceholder")}</option>
                      {STATES.map((value) => (
                        <option key={value} value={value}>
                          {t(AVAILABILITY_STATE_LABEL[value])}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField id={dayId} label={t("availability.contactedOn")} required error={dayError}>
                    <Input
                      compact
                      id={dayId}
                      type="date"
                      max={todayInVietnam()}
                      value={row.contactedOn}
                      invalid={dayError !== undefined}
                      aria-required
                      aria-describedby={describedBy(dayId, dayError)}
                      onChange={(event) => patch(row.spaceId, { contactedOn: event.target.value })}
                    />
                  </FormField>
                  <FormField id={expectedId} label={t("availability.expectedDate")} optional>
                    <Input
                      compact
                      id={expectedId}
                      type="date"
                      value={row.expectedDate}
                      onChange={(event) => patch(row.spaceId, { expectedDate: event.target.value })}
                    />
                  </FormField>
                </div>
                <FormField id={noteId} label={t("availability.note")} required error={noteError}>
                  <Textarea
                    id={noteId}
                    rows={2}
                    autoComplete="off"
                    maxLength={NOTE_MAX * 2}
                    value={row.note}
                    invalid={noteError !== undefined}
                    aria-required
                    aria-describedby={describedBy(noteId, noteError)}
                    onChange={(event) => patch(row.spaceId, { note: event.target.value })}
                  />
                </FormField>
              </fieldset>
            );
          })}
        </fieldset>
        {acting && (
          <Button type="submit" pending={pending} disabled={busy}>
            {pending ? t("availability.saving") : t("availability.save")}
          </Button>
        )}
      </form>
    </StepCard>
  );
}
