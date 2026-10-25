"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ChecklistCorrectionInput } from "@/features/surveys";
import { formatDate } from "@/lib/format/vietnam-time";

import { type CorrectionReason, distinctReasons } from "../../lib/checklist/correction-rule";
import { type ChecklistProblem, type ChecklistRules, checkCorrection } from "../../schemas/checklist";
import { REASON_MAX } from "../../schemas/survey/survey-text";
import { SurveyTextField } from "../survey/survey-text-field";

import { checklistProblemText } from "./checklist-copy";

type CorrectionBoxProps = {
  reasons: readonly CorrectionReason[];
  /** Opened by the server's 400 on `correction` (an entry put back after its removal, A-29). */
  server: boolean;
  rules: ChecklistRules;
  pending: boolean;
  onSubmit(correction: ChecklistCorrectionInput): void;
  onCancel(): void;
};

/**
 * The correction asked before a save replaces or removes someone else's recorded unit (survey-checklist BR-22, BR-27,
 * spec 6.2): why it is needed, then reason, basis date (from the visit's arrival to today) and basis text. One
 * correction covers every unit the save changes.
 */
export function CorrectionBox({ reasons, server, rules, pending, onSubmit, onCancel }: CorrectionBoxProps) {
  const t = useTranslations("OwnerLeads");
  const ids = { reason: useId(), date: useId(), text: useId() };
  const [form, setForm] = useState({ reason: "", basisDate: "", basisText: "" });
  const [problems, setProblems] = useState<Record<string, ChecklistProblem>>({});
  const person = (name: string | null) => name?.trim() || t("survey.unknownPerson");
  const sameDay = reasons.find((reason) => reason.kind === "heard-by" && reason.sameStatementOn !== undefined);
  const error = (path: string, kind: "text" | "date") =>
    problems[path] === undefined ? undefined : checklistProblemText(t, problems[path], kind, REASON_MAX);

  const submit = () => {
    const correction = { reason: form.reason, basis: { confirmedOn: form.basisDate, text: form.basisText } };
    const found = checkCorrection(correction, rules);
    setProblems(found);
    if (Object.keys(found).length === 0) onSubmit(correction);
  };

  return (
    <div role="group" aria-labelledby={`${ids.reason}-title`} className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h3 id={`${ids.reason}-title`} className="text-sm font-semibold text-slate-900">
        {t("checklist.correction.title")}
      </h3>
      <div aria-live="polite" className="space-y-1 text-sm text-slate-800">
        {distinctReasons(reasons).map((reason) => (
          <p key={`${reason.kind}-${reason.name ?? ""}`}>
            {reason.kind === "seen-by-performer"
              ? t("checklist.correction.seenBy", { name: person(reason.name), no: reason.surveyNo ?? "" })
              : reason.kind === "heard-by"
                ? t("checklist.correction.heardBy", { name: person(reason.name) })
                : t("checklist.correction.enteredBy", { name: person(reason.name) })}
          </p>
        ))}
        <p className={server ? "font-medium" : ""}>{t("checklist.correction.needed")}</p>
        {sameDay?.kind === "heard-by" && sameDay.sameStatementOn !== undefined && (
          <p className="text-xs text-slate-600">
            {t("checklist.correction.receiverHint", { date: formatDate(sameDay.sameStatementOn) })}
          </p>
        )}
      </div>
      <fieldset disabled={pending} className="space-y-3">
        <SurveyTextField
          id={ids.reason}
          label={t("checklist.correction.reason")}
          required
          rows={2}
          value={form.reason}
          onChange={(reason) => setForm({ ...form, reason })}
          error={error("reason", "text")}
        />
        <SurveyTextField
          id={ids.date}
          type="date"
          max={rules.today}
          label={t("checklist.correction.basisDate")}
          required
          value={form.basisDate}
          onChange={(basisDate) => setForm({ ...form, basisDate })}
          error={error("basis.confirmedOn", "date")}
        />
        <SurveyTextField
          id={ids.text}
          label={t("checklist.correction.basisText")}
          required
          rows={2}
          value={form.basisText}
          onChange={(basisText) => setForm({ ...form, basisText })}
          error={error("basis.text", "text")}
        />
        <div className="flex flex-wrap gap-2">
          <Button pending={pending} onClick={submit}>
            {t("checklist.correction.save")}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            {t("checklist.correction.cancel")}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
