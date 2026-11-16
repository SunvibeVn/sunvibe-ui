import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import {
  addTier,
  EARLY_LEASE_END_KINDS,
  type EarlyLeaseEndValues,
  FORMULA_KINDS,
  type FeePolicyErrors,
  type FeePolicyField,
  type FeePolicyValues,
  feePolicyProblemKey,
  type FormulaKind,
  type FormulaPart,
  MAX_TIERS,
  RENEWAL_KINDS,
  removeTier,
  setEarlyLeaseEndKind,
  setFormulaKind,
  setFormulaValue,
  setTier,
  type TierValues,
} from "../lib/fee-policy-form";
import type { EligibilityKey } from "../lib/reason-text";

type FeePolicySectionProps = {
  values: FeePolicyValues;
  /** One change, as a step from the current values (the edit form's state setter). */
  onChange: (step: (current: FeePolicyValues) => FeePolicyValues) => void;
  /** The client checks' problems of the last save. */
  errors: FeePolicyErrors;
  /** The last save's 400 named a `feePolicy...` path: the section says to check the fee. */
  rejected: boolean;
};

/** The labels of the two places a formula sits. */
const PART_TEXT = {
  formula: {
    kind: "edit.feePolicy.formula",
    tierFrom: "edit.feePolicy.tierFrom",
    tierPercent: "edit.feePolicy.tierPercent",
    addTier: "edit.feePolicy.addTier",
    removeTier: "edit.feePolicy.removeTier",
    amount: "edit.feePolicy.fixedAmount",
  },
  renewal: {
    kind: "edit.feePolicy.renewal",
    tierFrom: "edit.feePolicy.renewalTierFrom",
    tierPercent: "edit.feePolicy.renewalTierPercent",
    addTier: "edit.feePolicy.addRenewalTier",
    removeTier: "edit.feePolicy.removeRenewalTier",
    amount: "edit.feePolicy.renewalAmount",
  },
} as const satisfies Record<FormulaPart, Record<string, EligibilityKey>>;

const KINDS = { formula: FORMULA_KINDS, renewal: RENEWAL_KINDS } as const;

/**
 * The brokerage fee of the draft (brokerage-agreement US-1 AC-3, BR-7, S4-D3, S4-D14): who pays and when it arises as
 * fixed statements; how the fee is set (a percentage of one month's rent in up to five tiers by lease term, the first
 * from 1 month; a fixed amount; free of charge with a reason); when it is due; the renewal fee; the refund on an early
 * lease end; the protection period. Every part may stay not entered; none has a default. Only the chosen kind's fields
 * show and hold a value. The values live in the edit form's state only (BR-17).
 */
export function FeePolicySection({ values, onChange, errors, rejected }: FeePolicySectionProps) {
  const t = useTranslations("BrokerageAgreement");
  const baseId = useId();
  const idOf = (name: string) => `${baseId}-${name}`;
  const errorOf = (field: FeePolicyField) => {
    const problem = errors[field];
    return problem === undefined ? undefined : t(feePolicyProblemKey(problem));
  };

  /** A whole number typed as digits; `readOnly` for the first tier's start. */
  const numberField = (id: string, label: string, field: FeePolicyField, value: string, set: (value: string) => void, readOnly = false) => {
    const error = errorOf(field);
    return (
      <FormField id={id} label={label} error={error}>
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          readOnly={readOnly}
          className={readOnly ? "bg-slate-50 text-slate-500" : ""}
          invalid={error !== undefined}
          aria-describedby={describedBy(id, error)}
          onChange={(event) => set(event.target.value)}
        />
      </FormField>
    );
  };

  const tierRow = (part: FormulaPart, tier: TierValues, index: number) => {
    const text = PART_TEXT[part];
    return (
      <li
        key={index}
        className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      >
        {numberField(
          idOf(`${part}-tier-${index}-from`),
          t(text.tierFrom),
          `${part}.tiers.${index}.fromMonths`,
          tier.fromMonths,
          (fromMonths) => onChange((current) => setTier(current, part, index, { fromMonths })),
          index === 0,
        )}
        {numberField(
          idOf(`${part}-tier-${index}-percent`),
          t(text.tierPercent),
          `${part}.tiers.${index}.percent`,
          tier.percent,
          (percent) => onChange((current) => setTier(current, part, index, { percent })),
        )}
        {index > 0 && (
          <Button variant="ghost" className="px-3 py-1.5" onClick={() => onChange((current) => removeTier(current, part, index))}>
            {t(text.removeTier)}
          </Button>
        )}
      </li>
    );
  };

  const formulaBlock = (part: FormulaPart) => {
    const text = PART_TEXT[part];
    const formula = values[part];
    const kindId = idOf(`${part}-kind`);
    const amountId = idOf(`${part}-amount`);
    const reasonId = idOf(`${part}-reason`);
    const tiersError = errorOf(`${part}.tiers`);
    const reasonError = errorOf("formula.freeReason");
    return (
      <div className="space-y-3">
        <FormField id={kindId} label={t(text.kind)}>
          <Select
            id={kindId}
            value={formula.kind}
            onChange={(event) => {
              const kind = event.target.value as FormulaKind;
              onChange((current) => setFormulaKind(current, part, kind));
            }}
          >
            <option value="">{t("edit.feePolicy.notEntered")}</option>
            {KINDS[part].map((kind) => (
              <option key={kind} value={kind}>
                {t(`edit.feePolicy.kind.${kind}`)}
              </option>
            ))}
          </Select>
        </FormField>
        {formula.kind === "PERCENT_OF_RENT" && (
          <div className="space-y-3">
            <ul className="space-y-3">{formula.tiers.map((tier, index) => tierRow(part, tier, index))}</ul>
            {tiersError !== undefined && <p className="text-sm text-rose-600">{tiersError}</p>}
            <Button
              variant="secondary"
              className="px-4 py-2"
              disabled={formula.tiers.length >= MAX_TIERS}
              onClick={() => onChange((current) => addTier(current, part))}
            >
              {t(text.addTier)}
            </Button>
          </div>
        )}
        {formula.kind === "FIXED_AMOUNT" &&
          numberField(amountId, t(text.amount), `${part}.amount`, formula.amount, (amount) =>
            onChange((current) => setFormulaValue(current, part, "amount", amount)),
          )}
        {part === "formula" && formula.kind === "FREE" && (
          <FormField id={reasonId} label={t("edit.feePolicy.freeReason")} error={reasonError}>
            <Input
              id={reasonId}
              type="text"
              autoComplete="off"
              value={formula.freeReason}
              invalid={reasonError !== undefined}
              aria-describedby={describedBy(reasonId, reasonError)}
              onChange={(event) => {
                const { value } = event.target;
                onChange((current) => setFormulaValue(current, part, "freeReason", value));
              }}
            />
          </FormField>
        )}
      </div>
    );
  };

  const earlyKindId = idOf("early-kind");
  const { earlyLeaseEnd } = values;

  return (
    <fieldset className="min-w-0 space-y-4">
      <legend className="text-sm font-semibold text-slate-900">{t("edit.feePolicy.title")}</legend>
      <div className="space-y-0.5 text-sm text-slate-700">
        <p>{t("edit.feePolicy.payer")}</p>
        <p>{t("edit.feePolicy.chargedWhen")}</p>
      </div>
      {rejected && <p className="text-sm font-medium text-rose-600">{t("edit.feePolicy.errors.server")}</p>}
      {formulaBlock("formula")}
      {numberField(idOf("due"), t("edit.feePolicy.dueDays"), "dueDays", values.dueDays, (dueDays) =>
        onChange((current) => ({ ...current, dueDays })),
      )}
      {formulaBlock("renewal")}
      <div className="space-y-3">
        <FormField id={earlyKindId} label={t("edit.feePolicy.earlyLeaseEnd")}>
          <Select
            id={earlyKindId}
            value={earlyLeaseEnd.kind}
            onChange={(event) => {
              const kind = event.target.value as EarlyLeaseEndValues["kind"];
              onChange((current) => setEarlyLeaseEndKind(current, kind));
            }}
          >
            <option value="">{t("edit.feePolicy.notEntered")}</option>
            {EARLY_LEASE_END_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`edit.feePolicy.refund.${kind}`)}
              </option>
            ))}
          </Select>
        </FormField>
        {earlyLeaseEnd.kind === "PARTIAL_REFUND" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {numberField(
              idOf("refund-percent"),
              t("edit.feePolicy.refundPercent"),
              "earlyLeaseEnd.refundPercent",
              earlyLeaseEnd.refundPercent,
              (refundPercent) => onChange((current) => ({ ...current, earlyLeaseEnd: { ...current.earlyLeaseEnd, refundPercent } })),
            )}
            {numberField(
              idOf("refund-within"),
              t("edit.feePolicy.withinMonths"),
              "earlyLeaseEnd.withinMonths",
              earlyLeaseEnd.withinMonths,
              (withinMonths) => onChange((current) => ({ ...current, earlyLeaseEnd: { ...current.earlyLeaseEnd, withinMonths } })),
            )}
          </div>
        )}
      </div>
      {numberField(idOf("protection"), t("edit.feePolicy.protectionDays"), "protectionDays", values.protectionDays, (protectionDays) =>
        onChange((current) => ({ ...current, protectionDays })),
      )}
    </fieldset>
  );
}
