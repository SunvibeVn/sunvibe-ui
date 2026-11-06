"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";

import { type StepMode, targetModes } from "../lib/intake-steps";
import { selectedSpaces, spaceLabel } from "../lib/selection-form";
import { initialTarget, pickProperty, type TargetForm, type TargetProblems, targetBody, targetProblems } from "../lib/target-form";
import { putTarget } from "../services/intake-api";

import { FieldProblem } from "./field-problem";
import { COMMAND_IDLE, type CommandState, useIntake, useIntakeCommand, useIntakeLock } from "./intake-context";
import { IntakeMessage } from "./intake-message";
import { InventorySearch } from "./inventory-search";
import { StepCard } from "./step-card";

type TargetState = CommandState & { problems: TargetProblems };

const INITIAL: TargetState = { ...COMMAND_IDLE, problems: {} };

/** A new property, or a link to one the owner holds (spec 4.7, 4.8); the form starts again from a saved or changed target. */
export function TargetStep({ mode }: { mode: StepMode }) {
  const { block, epoch } = useIntake();
  return <TargetPanel key={`${epoch}:${block.target?.mode}:${block.target?.propertyCode}`} mode={mode} />;
}

function TargetPanel({ mode }: { mode: StepMode }) {
  const t = useTranslations("InventoryIntake");
  const { leadId, block, apply, busy } = useIntake();
  const run = useIntakeCommand();
  const [form, setForm] = useState<TargetForm>(() => initialTarget(block));
  const canonicalId = useId();
  const unitId = useId();

  const [state, dispatch, pending] = useActionState(async (): Promise<TargetState> => {
    const problems = targetProblems(form, block);
    if (Object.keys(problems).length > 0) return { ...COMMAND_IDLE, problems };
    const outcome = await run(() => putTarget(leadId, targetBody(form, block)), apply);
    return { ...outcome, problems: {} };
  }, INITIAL);
  useIntakeLock("target", pending);

  const modes = targetModes(block);
  const spaces = selectedSpaces(block);
  const bound = block.forcedPropertyCode ?? block.earlierResult?.propertyCode ?? "";
  const stored = block.target;
  const canonicalError = state.problems.canonical === undefined ? undefined : t("target.problems.canonical");
  const mappingError =
    state.problems.mappings === undefined
      ? undefined
      : t(state.problems.mappings === "overlap" ? "target.problems.mappingsOverlap" : "target.problems.mappingsRequired");

  return (
    <StepCard title={t("target.title")}>
      {stored?.mode === "CREATE" && <p className="text-sm text-slate-700">{t("target.currentCreate")}</p>}
      {stored?.mode === "LINK" && <p className="text-sm text-slate-700">{t("target.currentLink", { code: stored.propertyCode ?? "" })}</p>}
      {block.forcedPropertyCode && <Alert>{t("target.forced", { code: block.forcedPropertyCode })}</Alert>}
      {mode === "act" && (
        <>
          {state.message !== null && <IntakeMessage value={state.message} />}
          <fieldset disabled={pending} className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">{t("target.legend")}</legend>
            {modes.map((value) => (
              <label key={value} className="flex min-h-6 items-center gap-2 text-sm text-slate-800">
                <input
                  type="radio"
                  name="intake-target-mode"
                  className="h-4 w-4 border-slate-300 text-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                  checked={form.mode === value}
                  onChange={() => setForm((prev) => ({ ...prev, mode: value }))}
                />
                {t(value === "CREATE" ? "target.create" : "target.link")}
              </label>
            ))}
            {state.problems.mode !== undefined && <FieldProblem>{t("target.problems.mode")}</FieldProblem>}
          </fieldset>
          {form.mode === "LINK" && (
            <InventorySearch startCode={bound} pickedId={form.propertyId} onPick={(item) => setForm((prev) => pickProperty(prev, item))} />
          )}
          <form action={dispatch} noValidate className="space-y-3">
            <fieldset disabled={pending} className="max-w-md space-y-3">
              {form.mode === "CREATE" && block.source?.rentalScope === "PARTS" && (
                <FormField id={canonicalId} label={t("target.canonical")} required error={canonicalError} hint={t("target.canonicalHint")}>
                  <Select
                    id={canonicalId}
                    value={form.canonicalSpaceId}
                    invalid={canonicalError !== undefined}
                    aria-required
                    aria-describedby={describedBy(canonicalId, canonicalError, true)}
                    onChange={(event) => setForm((prev) => ({ ...prev, canonicalSpaceId: event.target.value }))}
                  >
                    <option value="">{t("target.canonicalPlaceholder")}</option>
                    {spaces.map((space) => (
                      <option key={space.spaceId} value={space.spaceId}>
                        {spaceLabel(space)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
              {form.mode === "LINK" && state.problems.property !== undefined && <FieldProblem>{t("target.problems.property")}</FieldProblem>}
              {form.mode === "LINK" &&
                form.propertyId !== "" &&
                spaces.map((space) => {
                  const id = `${unitId}-${space.spaceId}`;
                  const spaceId = space.spaceId ?? "";
                  return (
                    <FormField key={spaceId} id={id} label={t("target.unitFor", { part: spaceLabel(space) })} required>
                      <Select
                        id={id}
                        value={form.mappings[spaceId] ?? ""}
                        aria-required
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, mappings: { ...prev.mappings, [spaceId]: event.target.value } }))
                        }
                      >
                        <option value="">{t("target.unitPlaceholder")}</option>
                        {form.units.map((unit) => (
                          <option key={unit.unitId} value={unit.unitId}>
                            {[unit.unitCode, unit.location].filter(Boolean).join(" · ")}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  );
                })}
              {mappingError !== undefined && <FieldProblem>{mappingError}</FieldProblem>}
            </fieldset>
            <Button type="submit" pending={pending} disabled={busy}>
              {pending ? t("target.saving") : t("target.save")}
            </Button>
          </form>
        </>
      )}
    </StepCard>
  );
}
