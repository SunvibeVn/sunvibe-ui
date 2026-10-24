"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { todayInVietnam } from "@/lib/format/vietnam-time";

import { type ChecklistProblem, checkCorrection } from "../../schemas/checklist";
import { REASON_MAX } from "../../schemas/survey/survey-text";
import { SurveyTextField } from "../survey/survey-text-field";

import { useChecklistPage } from "./checklist-context";
import { checklistProblemText } from "./checklist-copy";

/**
 * "Take over this draft" (survey-checklist spec 6.2, BR-14): reason and basis (date from the visit's arrival to today,
 * text). Every panel waits while it runs; on success the viewer is the holder and the Edit tab opens its inputs.
 */
export function TakeoverDialog({ onClose }: { onClose(): void }) {
  const t = useTranslations("OwnerLeads");
  const { view, rules, takeOver } = useChecklistPage();
  const [form, setForm] = useState({ reason: "", basisDate: "", basisText: "" });
  const [problems, setProblems] = useState<Record<string, ChecklistProblem>>({});
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const formId = useId();
  const ids = { reason: useId(), date: useId(), text: useId() };
  const today = todayInVietnam();
  const text = (field: string, kind: "text" | "date") => {
    const problem = problems[field];
    if (problem === undefined) return undefined;
    return checklistProblemText(t, problem, kind, REASON_MAX);
  };

  const submit = async () => {
    if (pending) return;
    const body = { reason: form.reason, basis: { confirmedOn: form.basisDate, text: form.basisText } };
    const found = checkCorrection(body, rules);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    setPending(true);
    setFailed(false);
    const outcome = await takeOver({ expectedVersion: view.version ?? 0, ...body });
    setPending(false);
    if (outcome.kind === "saved") {
      onClose();
      return;
    }
    const fields = outcome.error.fieldErrors ?? {};
    const named: Record<string, ChecklistProblem> = {};
    for (const field of ["reason", "basis.confirmedOn", "basis.text"]) if (field in fields) named[field] = "invalid";
    if (Object.keys(named).length > 0) setProblems(named);
    else if (outcome.error.kind === "stale" || outcome.error.kind === "not-allowed") onClose();
    else setFailed(true);
  };

  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={t("checklist.takeover.title")}
      closeLabel={pending ? undefined : t("checklist.takeover.close")}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {t("checklist.takeover.close")}
          </Button>
          <Button type="submit" form={formId} pending={pending}>
            {pending ? t("checklist.takeover.saving") : t("checklist.takeover.save")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {failed && <Alert tone="error">{t("checklist.errors.failed")}</Alert>}
        <fieldset disabled={pending} className="space-y-4">
          <SurveyTextField
            id={ids.reason}
            label={t("checklist.takeover.reason")}
            required
            rows={2}
            value={form.reason}
            onChange={(reason) => setForm({ ...form, reason })}
            error={text("reason", "text")}
          />
          <SurveyTextField
            id={ids.date}
            type="date"
            max={today}
            label={t("checklist.takeover.basisDate")}
            required
            value={form.basisDate}
            onChange={(basisDate) => setForm({ ...form, basisDate })}
            error={text("basis.confirmedOn", "date")}
          />
          <SurveyTextField
            id={ids.text}
            label={t("checklist.takeover.basisText")}
            required
            rows={2}
            hint={t("checklist.takeover.basisHint")}
            value={form.basisText}
            onChange={(basisText) => setForm({ ...form, basisText })}
            error={text("basis.text", "text")}
          />
          <p className="text-xs text-amber-700">{t("checklist.reminder.noCodes")}</p>
        </fieldset>
      </form>
    </Dialog>
  );
}
