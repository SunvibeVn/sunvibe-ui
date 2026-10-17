"use client";

import { useTranslations } from "next-intl";

import { consentCheckboxId, consentDescribedBy, consentErrorId, consentNoticeId } from "../lib/consent";

export type ConsentFieldProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Already translated message for `consent.accepted` (E-2). */
  error?: string;
  disabled?: boolean;
};

/** Required consent checkbox with the BR-9 notice right under it (version CONSENT_NOTICE_VERSION). */
export function ConsentField({ checked, onChange, error, disabled }: ConsentFieldProps) {
  const t = useTranslations("OwnerIntake");
  return (
    <div className="space-y-1.5">
      <label htmlFor={consentCheckboxId} className="flex items-start gap-3 text-sm font-medium text-slate-700">
        <input
          id={consentCheckboxId}
          type="checkbox"
          required
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={consentDescribedBy(Boolean(error))}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-orange-600"
        />
        <span>
          {t("consent.label")}
          <span aria-hidden="true" className="ml-0.5 text-rose-600">
            *
          </span>
        </span>
      </label>
      <p id={consentNoticeId} className="pl-7 text-xs text-slate-600">
        {t("consent.notice")}
      </p>
      {error && (
        <p id={consentErrorId} className="pl-7 text-sm text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
