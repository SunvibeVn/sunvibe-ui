import type { ReactNode } from "react";

type FormFieldProps = {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  /** Shows a "*" after the label (the page explains it). */
  required?: boolean;
  /** Shown at the right of the label, e.g. a "Forgot password?" link. */
  labelAction?: ReactNode;
  children: ReactNode;
};

/** Label, control and message. Give the control `aria-describedby={describedBy(id, error)}`. */
export function FormField({ id, label, error, hint, optional, required, labelAction, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-rose-600">
              *
            </span>
          )}
          {optional && <span className="ml-1 font-normal text-slate-400">(optional)</span>}
        </label>
        {labelAction}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <div id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, error?: string, hasHint = false) {
  if (error) return `${id}-error`;
  return hasHint ? `${id}-hint` : undefined;
}
