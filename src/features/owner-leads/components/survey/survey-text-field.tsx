"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatLocalInput } from "@/lib/format/vietnam-time";

type SurveyTextFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  optional?: boolean;
  /** A textarea of this many rows; an input when left out. */
  rows?: number;
  /** `datetime-local` or `date`; text by default. */
  type?: "text" | "datetime-local" | "date";
  /** For date inputs: the last day that can be picked (`yyyy-MM-dd`). */
  max?: string;
};

/**
 * One labelled text, textarea, date or date-time control of a survey dialog, with its message. A date or date-time
 * also shows its value as `dd/MM/yyyy (HH:mm)` under the input, since the browser draws it in its own locale (W15-38).
 */
export function SurveyTextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required,
  optional,
  rows,
  type = "text",
  max,
}: SurveyTextFieldProps) {
  const t = useTranslations("OwnerLeads");
  const shown = type === "datetime-local" ? formatLocalInput(value) : type === "date" ? formatDate(value) : "";
  const shownId = `${id}-shown`;
  const describe =
    [describedBy(id, error, hint !== undefined), shown === "" ? undefined : shownId].filter(Boolean).join(" ") ||
    undefined;
  return (
    <FormField id={id} label={label} error={error} hint={hint} required={required} optional={optional}>
      {rows === undefined ? (
        <>
          <Input
            id={id}
            type={type}
            value={value}
            max={max}
            invalid={error !== undefined}
            aria-describedby={describe}
            aria-required={required || undefined}
            onChange={(event) => onChange(event.target.value)}
          />
          {shown !== "" && (
            <p id={shownId} className="mt-1 text-xs text-slate-600">
              {type === "datetime-local" ? t("survey.form.shownVietnam", { value: shown }) : shown}
            </p>
          )}
        </>
      ) : (
        <Textarea
          id={id}
          rows={rows}
          value={value}
          invalid={error !== undefined}
          aria-describedby={describe}
          aria-required={required || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FormField>
  );
}
