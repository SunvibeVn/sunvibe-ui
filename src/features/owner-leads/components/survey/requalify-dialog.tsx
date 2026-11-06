"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { useFormDraft } from "@/features/lead-shared/client";
import { type ChecklistRequalificationKind, requalifyChecklist } from "@/features/surveys";
import { vietnamDate } from "@/lib/format/vietnam-time";

import { REQUALIFICATION_KIND_LABEL } from "../../../surveys/lib/checklist/label-text";
import {
  createSubmitGate,
  firstRequalifyField,
  openedTarget,
  REQUALIFY_DEFAULTS,
  REQUALIFY_REASON_MAX,
  REQUALIFY_TEXT_MAX,
  type RequalifyField,
  type RequalifyTarget,
  runRequalify,
  tickStands,
  toRequalifyBody,
  validateRequalify,
} from "../../lib/requalify-form";
import type { SurveyProblems } from "../../../surveys/schemas/survey/survey-text";

import { problemText } from "./survey-copy";
import { type SurveyDialogMessage, SurveyMessage } from "./survey-message";
import { useSurveyPanel } from "./survey-panel-context";
import { SurveyTextField } from "./survey-text-field";
import { useSurveyLock } from "./use-survey-lock";

const KINDS = Object.keys(REQUALIFICATION_KIND_LABEL) as ChecklistRequalificationKind[];

type RequalifyState = { problems: SurveyProblems<RequalifyField>; message: SurveyDialogMessage | null };
const INITIAL: RequalifyState = { problems: {}, message: null };

type RequalifyDialogProps = {
  /** The revision and version the block allows now; null once it no longer does, or while the block cannot be read. */
  target: RequalifyTarget | null;
  /** The survey block is on screen: false after a failed read, when nobody knows whether a lost answer marked it. */
  read: boolean;
  /** An ON_HOLD lead stays held; a QUALIFIED one goes back to Contacted (spec 4). */
  held: boolean;
  onClose(): void;
  onSaved(): void;
};

/**
 * "Requalify" (property-create requalification spec 6): the kind, what happened, its source, what it affects, the date
 * and a confirmation. A refusal keeps the form and shows its message; once the block no longer allows a mark the form
 * stays to copy from, and nothing can be sent. The text lives in the tab's drafts only, as in every survey dialog, tied
 * to the revision of this opening.
 */
export function RequalifyDialog({ target, read, held, onClose, onSaved }: RequalifyDialogProps) {
  const t = useTranslations("OwnerLeads");
  const { userId, leadId, reload, leaveToList } = useSurveyPanel();
  /** The revision this opening is about: its text never fills or reaches another one, and a mark cannot be undone. */
  const [opened] = useState(target?.checklistId ?? "");
  const sendable = openedTarget(target, opened);
  const [form, setForm, clearForm] = useFormDraft({ userId, leadId, form: "surveyRequalify" }, REQUALIFY_DEFAULTS, opened);
  /** Not a draft: every opening is confirmed again, and so is a consequence that changed under it. */
  const [tickedFor, setTickedFor] = useState<boolean | null>(null);
  const confirmed = tickStands(tickedFor, held);
  const [gate] = useState(createSubmitGate);

  const [state, dispatch, pending] = useActionState(async (prev: RequalifyState): Promise<RequalifyState> => {
    const problems = validateRequalify(form, { now: Date.now(), confirmed });
    if (sendable === null || Object.keys(problems).length > 0) {
      gate.leave(false);
      return sendable === null ? prev : { problems, message: null };
    }
    const step = await runRequalify({
      send: () => requalifyChecklist(sendable.checklistId, toRequalifyBody(form, { expectedVersion: sendable.expectedVersion })),
      clear: () => clearForm(form),
      reload,
    });
    gate.leave(step.kind === "saved");
    switch (step.kind) {
      case "saved":
        onSaved();
        return INITIAL;
      case "leave":
        leaveToList();
        return prev;
      case "session":
        return prev;
      case "fields":
        return { problems: step.problems, message: null };
      case "message":
        return {
          problems: {},
          message:
            step.correlationId === undefined
              ? { message: step.message }
              : { message: step.message, correlationId: step.correlationId },
        };
    }
  }, INITIAL);
  useSurveyLock(pending);

  const submit = () => {
    if (gate.enter()) dispatch();
  };

  const formId = useId();
  const ids: Record<RequalifyField, string> = {
    reasonKind: useId(),
    reason: useId(),
    eventSource: useId(),
    scope: useId(),
    basisDate: useId(),
    confirmed: useId(),
  };
  const firstField = firstRequalifyField(state.problems);
  const firstId = firstField === null ? null : ids[firstField];
  // After each refusal: the submit sits in the footer, so the field may be scrolled out of view.
  useEffect(() => {
    if (firstId !== null) document.getElementById(firstId)?.focus();
  }, [state, firstId]);

  const problem = state.problems;
  const kindError = problem.reasonKind === undefined ? undefined : problemText(t, problem.reasonKind);
  const confirmedError = problem.confirmed === undefined ? undefined : t("survey.requalifyDialog.confirmRequired");
  const today = vietnamDate(new Date().toISOString());
  const close = () => {
    // A revision that can no longer be marked takes its text with it; after a failed read nobody knows yet.
    if (read && sendable === null) clearForm();
    onClose();
  };

  return (
    <Dialog
      open
      onClose={pending ? () => undefined : close}
      title={t("survey.requalifyDialog.title")}
      closeLabel={pending ? undefined : t("survey.form.close")}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={close}>
            {t("survey.form.close")}
          </Button>
          <Button type="submit" form={formId} pending={pending} disabled={sendable === null}>
            {pending ? t("survey.form.saving") : t("survey.requalifyDialog.submit")}
          </Button>
        </>
      }
    >
      <form id={formId} action={submit} noValidate className="space-y-4">
        {state.message !== null && <SurveyMessage value={state.message} />}
        {sendable === null && !pending && (
          <Alert>{t(read ? "survey.requalifyDialog.noLonger" : "survey.requalifyDialog.unknown")}</Alert>
        )}
        <p className="text-sm text-slate-700">{t("survey.requalifyDialog.intro")}</p>
        <fieldset disabled={pending} className="space-y-4">
          <FormField id={ids.reasonKind} label={t("survey.requalifyDialog.kind")} required error={kindError}>
            <Select
              id={ids.reasonKind}
              value={form.reasonKind}
              invalid={kindError !== undefined}
              aria-describedby={describedBy(ids.reasonKind, kindError)}
              aria-required
              onChange={(event) => setForm({ ...form, reasonKind: event.target.value })}
            >
              <option value="">{t("survey.requalifyDialog.kindPlaceholder")}</option>
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(REQUALIFICATION_KIND_LABEL[kind])}
                </option>
              ))}
            </Select>
          </FormField>
          <SurveyTextField
            id={ids.reason}
            label={t("survey.requalifyDialog.reason")}
            required
            rows={3}
            value={form.reason}
            onChange={(reason) => setForm({ ...form, reason })}
            error={problem.reason === undefined ? undefined : problemText(t, problem.reason, "text", REQUALIFY_REASON_MAX)}
          />
          <SurveyTextField
            id={ids.eventSource}
            label={t("survey.requalifyDialog.source")}
            required
            value={form.eventSource}
            onChange={(eventSource) => setForm({ ...form, eventSource })}
            error={problem.eventSource === undefined ? undefined : problemText(t, problem.eventSource, "text", REQUALIFY_TEXT_MAX)}
          />
          <SurveyTextField
            id={ids.scope}
            label={t("survey.requalifyDialog.scope")}
            required
            value={form.scope}
            onChange={(scope) => setForm({ ...form, scope })}
            error={problem.scope === undefined ? undefined : problemText(t, problem.scope, "text", REQUALIFY_TEXT_MAX)}
          />
          <SurveyTextField
            id={ids.basisDate}
            type="date"
            max={today}
            label={t("survey.requalifyDialog.basisDate")}
            required
            hint={t("survey.requalifyDialog.basisDateHint")}
            value={form.basisDate}
            onChange={(basisDate) => setForm({ ...form, basisDate })}
            error={problem.basisDate === undefined ? undefined : problemText(t, problem.basisDate, "decisionDate")}
          />
          <div className="space-y-1">
            <label htmlFor={ids.confirmed} className="flex items-start gap-2 text-sm font-medium text-slate-700">
              <input
                id={ids.confirmed}
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                checked={confirmed}
                aria-invalid={confirmedError !== undefined || undefined}
                aria-describedby={describedBy(ids.confirmed, confirmedError)}
                onChange={(event) => setTickedFor(event.target.checked ? held : null)}
              />
              {t(held ? "survey.requalifyDialog.confirmHeld" : "survey.requalifyDialog.confirmQualified")}
            </label>
            {confirmedError !== undefined && (
              <p id={`${ids.confirmed}-error`} className="text-sm text-rose-600">
                {confirmedError}
              </p>
            )}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
