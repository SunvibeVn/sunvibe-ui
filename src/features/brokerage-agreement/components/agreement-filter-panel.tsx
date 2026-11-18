"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";

import { AGREEMENT_STATUSES, type AgreementListState } from "../lib/agreement-list-state";
import { agreementStatusText } from "../lib/status-text";
import type { AgreementStatus } from "../types";

type AgreementFilterChange = { status?: AgreementStatus | null; ending?: boolean };

/**
 * The filters of the agreement list (brokerage-agreement US-4 AC-3, S7-D3, S7-D4, spec section 6): one stored state or
 * all states, and "Ends within the next 30 days". The controls mirror the address; each change goes through `onChange`,
 * which returns to page 1. The server decides which agreements match.
 */
export function AgreementFilterPanel({
  state,
  onChange,
}: {
  state: AgreementListState;
  onChange: (change: AgreementFilterChange) => void;
}) {
  const t = useTranslations("BrokerageAgreement");
  const statusId = useId();
  const endingId = useId();

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="w-full max-w-xs">
        <FormField id={statusId} label={t("list.state")}>
          <Select
            id={statusId}
            value={state.status ?? ""}
            onChange={(event) => {
              const { value } = event.target;
              onChange({ status: AGREEMENT_STATUSES.find((code) => code === value) ?? null });
            }}
          >
            <option value="">{t("list.allStates")}</option>
            {AGREEMENT_STATUSES.map((code) => (
              <option key={code} value={code}>
                {t(agreementStatusText(code))}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <div className="flex min-h-10 items-center gap-2">
        <input
          id={endingId}
          type="checkbox"
          checked={state.ending}
          onChange={(event) => onChange({ ending: event.target.checked })}
          className="h-4 w-4 shrink-0 accent-violet-600"
        />
        <label htmlFor={endingId} className="text-sm font-medium text-slate-800">
          {t("list.endingSoon")}
        </label>
      </div>
    </div>
  );
}
