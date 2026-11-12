"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format/vietnam-time";

import type { StepMode } from "../lib/intake-steps";
import { RENTAL_SCOPE_LABEL } from "../lib/labels";
import { initialSelection, selectionBody, selectionChanged, selectionProblem, toggleSpace } from "../lib/selection-form";
import { codeText } from "../lib/code-text";
import { termValueText } from "../lib/term-text";
import { putSelection } from "../services/intake-api";

import { FieldProblem } from "./field-problem";
import { COMMAND_IDLE, type CommandState, useIntake, useIntakeCommand, useIntakeLock } from "./intake-context";
import { IntakeMessage } from "./intake-message";
import { StepCard } from "./step-card";

type SelectionState = CommandState & { problem: "required" | "tooMany" | null };

const INITIAL: SelectionState = { ...COMMAND_IDLE, problem: null };

/** The parts of the survey to take into inventory (spec 4.5): the form starts again from a saved or changed selection. */
export function SelectionStep({ mode }: { mode: StepMode }) {
  const { block, epoch } = useIntake();
  return <SelectionForm key={`${epoch}:${block.selection?.spaceIds?.join() ?? ""}`} mode={mode} />;
}

function SelectionForm({ mode }: { mode: StepMode }) {
  const t = useTranslations("InventoryIntake");
  const { leadId, block, apply, busy } = useIntake();
  const run = useIntakeCommand();
  const [selected, setSelected] = useState(() => initialSelection(block));
  const errorId = useId();
  const unchangedId = useId();

  const [state, dispatch, pending] = useActionState(async (): Promise<SelectionState> => {
    // property-create SV-202: the stored parts again change nothing, so they are not sent, also from the keyboard.
    if (!selectionChanged(selected, block)) return INITIAL;
    const problem = selectionProblem(selected);
    if (problem !== null) return { ...COMMAND_IDLE, problem };
    const outcome = await run(() => putSelection(leadId, selectionBody(selected, block)), apply);
    return { ...outcome, problem: null };
  }, INITIAL);
  useIntakeLock("selection", pending);

  const source = block.source;
  const acting = mode === "act";
  const whole = source?.rentalScope === "WHOLE";
  const replaces = block.status !== undefined && block.status !== null && block.status !== "DRAFT";
  const changed = selectionChanged(selected, block);

  return (
    <StepCard title={t("selection.title")}>
      {source?.rentalScope !== undefined && (
        <p className="text-sm text-slate-600">{t("selection.scope", { scope: t(RENTAL_SCOPE_LABEL[source.rentalScope]) })}</p>
      )}
      {acting && <p className="text-sm text-slate-600">{t("selection.intro")}</p>}
      <form action={dispatch} noValidate className="space-y-3">
        {state.message !== null && <IntakeMessage value={state.message} />}
        <fieldset disabled={pending || !acting} className="space-y-2" aria-describedby={state.problem ? errorId : undefined}>
          <legend className="sr-only">{t("selection.title")}</legend>
          {(source?.spaces ?? []).map((space) => (
            <label key={space.spaceId} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                checked={selected.includes(space.spaceId ?? "")}
                disabled={whole}
                onChange={() => setSelected((prev) => toggleSpace(prev, space.spaceId ?? "", block))}
              />
              <span className="min-w-0 break-words">
                <span className="font-medium text-slate-900">{space.code}</span>
                {space.location && <span className="text-slate-600"> · {space.location}</span>}
                {space.accessLimits && (
                  <span className="block text-slate-600">
                    {t("selection.accessLimits")}: {space.accessLimits}
                  </span>
                )}
                {space.sourceDate && (
                  <span className="block text-xs text-slate-500">
                    {t("selection.sourceDate")}: {formatDate(space.sourceDate)}
                  </span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
        {state.problem !== null && <FieldProblem id={errorId}>{t(`selection.problems.${state.problem}`)}</FieldProblem>}
        {(source?.unconfirmedTerms ?? []).length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-slate-700">{t("selection.terms")}</h3>
            <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
              {(source?.unconfirmedTerms ?? []).map((term) => (
                <li key={term.name}>
                  {codeText(term.name ?? "")}: {termValueText(term.value) ?? t("selection.noValue")}
                  {term.date && <span className="text-xs text-slate-500"> ({formatDate(term.date)})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {acting && (
          <>
            <p className="text-xs text-slate-500">{t("selection.separate")}</p>
            {replaces && changed && <Alert>{t("selection.changeWarning")}</Alert>}
            {!changed && (
              <p id={unchangedId} className="text-xs text-slate-500">
                {t("selection.unchanged")}
              </p>
            )}
            <Button
              type="submit"
              variant="secondary"
              pending={pending}
              disabled={busy || !changed}
              aria-describedby={changed ? undefined : unchangedId}
            >
              {pending ? t("selection.saving") : t("selection.save")}
            </Button>
          </>
        )}
      </form>
    </StepCard>
  );
}
