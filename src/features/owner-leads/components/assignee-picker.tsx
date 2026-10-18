"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { ForbiddenNotice } from "@/features/auth/client";

import type { LeadUiError } from "../lib/lead-ui-error";
import type { EligibleAssignee } from "../types";

import { useAssigneeOptionLabel } from "./use-assignee-option-label";

/** The eligible-assignee list as a dialog holds it. */
export type AssigneesLoad =
  | { state: "loading" }
  | { state: "ready"; list: EligibleAssignee[] }
  | { state: "error"; error: LeadUiError };

/** Texts of one dialog (each keeps its own namespace). */
export type AssigneePickerLabels = {
  loading: string;
  loadFailed: string;
  supportCode(correlationId: string): string;
  retry: string;
  noOptions: string;
  label: string;
  placeholder: string;
};

type AssigneePickerProps = {
  id: string;
  assignees: AssigneesLoad;
  /** The value of the select ("" = none); see `selectedAssignee`. */
  selected: string;
  /** The value of the chosen option ("" for the placeholder). */
  onPick(userId: string): void;
  /** Message under the select (required, or a 400 on the user id). */
  error: string | undefined;
  onRetry(): void;
  disabled?: boolean;
  labels: AssigneePickerLabels;
};

/**
 * The assignee select of the assign dialogs (C-29, US-8): loading text; load error with the forbidden notice or the
 * message, support code and retry; "no options"; else a required select of "<tên> · <vai trò>" options with a
 * placeholder while nothing is selected.
 */
export function AssigneePicker({
  id,
  assignees,
  selected,
  onPick,
  error,
  onRetry,
  disabled = false,
  labels,
}: AssigneePickerProps) {
  const optionLabel = useAssigneeOptionLabel();
  if (assignees.state === "loading") {
    return (
      <p role="status" className="text-sm text-slate-600">
        {labels.loading}
      </p>
    );
  }
  if (assignees.state === "error") {
    return assignees.error.kind === "forbidden" ? (
      <ForbiddenNotice />
    ) : (
      <div className="space-y-2">
        <Alert tone="error">
          <p>{labels.loadFailed}</p>
          {assignees.error.correlationId !== undefined && (
            <p className="mt-1 text-xs">{labels.supportCode(assignees.error.correlationId)}</p>
          )}
        </Alert>
        <Button variant="secondary" disabled={disabled} onClick={onRetry}>
          {labels.retry}
        </Button>
      </div>
    );
  }
  if (assignees.list.length === 0) return <p className="text-sm text-slate-600">{labels.noOptions}</p>;

  return (
    <FormField id={id} label={labels.label} required error={error}>
      <Select
        id={id}
        value={selected}
        aria-required="true"
        invalid={error !== undefined}
        aria-describedby={describedBy(id, error)}
        onChange={(event) => onPick(event.target.value)}
      >
        {selected === "" && <option value="">{labels.placeholder}</option>}
        {assignees.list.map((person) =>
          person.userId === undefined ? null : (
            <option key={person.userId} value={person.userId}>
              {optionLabel(person)}
            </option>
          ),
        )}
      </Select>
    </FormField>
  );
}
