"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import { selectedAssignee } from "../lib/assignee-pick";
import { prepareTerritoryAssign, type TerritoryProblem } from "../lib/territory-flags";
import type { Territory } from "../types";

import { type AssigneePickerLabels, AssigneePicker, type AssigneesLoad } from "./assignee-picker";
import { ProblemAlert, SupportCode } from "./territory-problem";

type TerritoryAssignDialogProps = {
  territory: Territory;
  eligible: AssigneesLoad;
  busy: boolean;
  problem: TerritoryProblem | null;
  onRetryEligible(): void;
  /** Sends the pick; resolves when the call is over. A pick equal to the holder never reaches it. */
  onSubmit(userId: string, holderName: string | undefined): Promise<void>;
  onUnchanged(): void;
  /** Esc, the backdrop, the close button or "Cancel": the view always closes the dialog (Dialog contract). */
  onClose(): void;
};

/**
 * "Gán" / "Đổi" (US-8 AC-2): a select of the eligible assignees, the current holder preselected when listed. A holder
 * who is no longer eligible (C-40) is named above the select. The same person sends nothing.
 */
export function TerritoryAssignDialog({
  territory,
  eligible,
  busy,
  problem,
  onRetryEligible,
  onSubmit,
  onUnchanged,
  onClose,
}: TerritoryAssignDialogProps) {
  const t = useTranslations("SaleTerritories");
  const list = eligible.state === "ready" ? eligible.list : [];
  const currentId = territory.userId === "" ? undefined : territory.userId;
  const [picked, setPicked] = useState<string | null>(null);
  const selected = selectedAssignee(list, picked, currentId);
  const [required, setRequired] = useState(false);

  const [, dispatch, pending] = useActionState(async (): Promise<null> => {
    const step = prepareTerritoryAssign(selected, currentId);
    if (step.kind === "invalid") {
      setRequired(true);
      return null;
    }
    if (step.kind === "unchanged") {
      onUnchanged();
      return null;
    }
    const person = list.find((candidate) => candidate.userId === step.userId);
    await onSubmit(step.userId, person?.fullName);
    return null;
  }, null);

  const formId = useId();
  const selectId = useId();
  const submitting = pending || busy;
  const fieldError =
    required && selected === ""
      ? t("dialog.assigneeRequired")
      : problem?.kind === "field"
        ? t("errors.userIdInvalid")
        : undefined;
  const holderName = territory.userName?.trim() ? territory.userName : t("holder.unknown");
  const holderNotListed =
    currentId !== undefined && eligible.state === "ready" && !list.some((person) => person.userId === currentId);

  const labels: AssigneePickerLabels = {
    loading: t("dialog.loading"),
    loadFailed: t("dialog.loadFailed"),
    supportCode: (correlationId) => t("errors.supportCode", { correlationId }),
    retry: t("retry"),
    noOptions: t("dialog.noOptions"),
    label: t("dialog.assignee"),
    placeholder: t("dialog.assigneePlaceholder"),
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={currentId === undefined ? t("dialog.titleAssign") : t("dialog.titleChange")}
      closeLabel={submitting ? undefined : t("dialog.cancel")}
      footer={
        <>
          <Button variant="secondary" disabled={submitting} onClick={onClose}>
            {t("dialog.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            pending={submitting}
            disabled={eligible.state !== "ready" || list.length === 0}
          >
            {submitting ? t("dialog.submitting") : t("dialog.confirm")}
          </Button>
        </>
      }
    >
      <form id={formId} action={dispatch} noValidate className="space-y-4">
        {problem !== null && problem.kind !== "field" && <ProblemAlert problem={problem} />}
        <fieldset disabled={submitting} className="space-y-4">
          <p className="text-sm text-slate-700">{t("dialog.ward", { ward: territory.wardName ?? "" })}</p>
          {holderNotListed && <p className="text-sm text-slate-700">{t("dialog.currentHolder", { name: holderName })}</p>}
          <AssigneePicker
            id={selectId}
            assignees={eligible}
            selected={selected}
            onPick={(userId) => {
              setPicked(userId === "" ? null : userId);
              setRequired(false);
            }}
            error={fieldError}
            onRetry={onRetryEligible}
            disabled={submitting}
            labels={labels}
          />
          {problem?.kind === "field" && <SupportCode correlationId={problem.correlationId} />}
        </fieldset>
      </form>
    </Dialog>
  );
}
