"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import type { ChecklistProblem } from "../../schemas/checklist";
import { SurveyTextField } from "../survey/survey-text-field";

import { checklistProblemText } from "./checklist-copy";

/** How a field's value is entered (survey-checklist spec 4.6). */
export type ValueKind =
  | { kind: "text"; max: number; rows?: number }
  | { kind: "integer"; min: number; max: number }
  | { kind: "area" }
  | { kind: "date"; max?: string }
  | { kind: "enum"; options: readonly { value: string; label: string }[] }
  | { kind: "fit" }
  | { kind: "actualAccess" }
  | { kind: "areaCheck" }
  | { kind: "observation" }
  | { kind: "rent" }
  | { kind: "deposit" }
  | { kind: "charge" }
  | { kind: "fees" }
  | { kind: "pets" };

type Json = Record<string, unknown>;
type Problems = Readonly<Record<string, ChecklistProblem>>;

type ValueEditorProps = {
  id: string;
  label: string;
  kind: ValueKind;
  value: unknown;
  onChange(value: unknown): void;
  /** Problems below the value, by relative path ("" for the value itself, `amount`, `reason`, ...). */
  problems: Problems;
  disabled?: boolean;
};

const CHARGE_UNITS = ["PER_MONTH", "PER_KWH", "PER_M3", "PER_PERSON_PER_MONTH", "PER_VEHICLE_PER_MONTH", "ONE_OFF"] as const;

/** A number typed as text: shows what the user typed while it reads as the value, else the value. */
function NumberInput({
  id,
  label,
  value,
  onChange,
  decimals,
  error,
  disabled,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange(value: number | null): void;
  decimals: boolean;
  error?: string;
  disabled?: boolean;
}) {
  const [raw, setRaw] = useState(value === null ? "" : String(value));
  const parse = (text: string): number | null => {
    const clean = text.replace(/[\s.,](?=\d{3}(\D|$))/g, "").replace(",", ".").trim();
    if (clean === "") return null;
    if (!(decimals ? /^\d+(\.\d*)?$/ : /^\d+$/).test(clean)) return Number.NaN;
    return Number(clean);
  };
  const shown = parse(raw) === value || (Number.isNaN(parse(raw)) && value === null) ? raw : value === null ? "" : String(value);
  return (
    <FormField id={id} label={label} error={error}>
      <Input
        id={id}
        inputMode={decimals ? "decimal" : "numeric"}
        value={shown}
        disabled={disabled}
        invalid={error !== undefined}
        aria-describedby={describedBy(id, error)}
        onChange={(event) => {
          setRaw(event.target.value);
          const next = parse(event.target.value);
          onChange(next === null || Number.isNaN(next) ? null : next);
        }}
      />
    </FormField>
  );
}

/** A whole VND amount, typed with or without thousands separators. */
function MoneyInput(props: { id: string; label: string; value: unknown; onChange(amount: number | null): void; error?: string; disabled?: boolean }) {
  const amount = typeof props.value === "number" ? props.value : null;
  return <NumberInput {...props} value={amount} decimals={false} />;
}

function Choice({
  id,
  label,
  value,
  options,
  onChange,
  error,
  disabled,
  placeholder,
}: {
  id: string;
  label: string;
  value: string | null;
  options: readonly { value: string; label: string }[];
  onChange(value: string | null): void;
  error?: string;
  disabled?: boolean;
  placeholder: string;
}) {
  return (
    <FormField id={id} label={label} error={error}>
      <Select
        id={id}
        value={value ?? ""}
        disabled={disabled}
        invalid={error !== undefined}
        aria-describedby={describedBy(id, error)}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </FormField>
  );
}

/** The value part of a field control, by kind; every sub-input has its label and its own message. */
export function ValueEditor({ id, label, kind, value, onChange, problems, disabled }: ValueEditorProps) {
  const t = useTranslations("OwnerLeads");
  const error = (path: string, fieldKind: "text" | "date" = "text", max?: number) => {
    const problem = problems[path];
    return problem === undefined ? undefined : checklistProblemText(t, problem, fieldKind, max);
  };
  const v = (value ?? {}) as Json;
  const set = (patch: Json) => onChange({ ...v, ...patch });
  const choose = t("checklist.panel.choose");
  const text = (path: string, fieldLabel: string, current: unknown, max: number, rows: number, patch: (next: string) => Json, hint?: string) => (
    <SurveyTextField
      id={`${id}-${path}`}
      label={fieldLabel}
      rows={rows}
      hint={hint}
      value={typeof current === "string" ? current : ""}
      onChange={(next) => set(patch(next))}
      error={error(path, "text", max)}
    />
  );

  switch (kind.kind) {
    case "text":
      return (
        <SurveyTextField
          id={id}
          label={label}
          rows={kind.rows}
          value={typeof value === "string" ? value : ""}
          onChange={(next) => onChange(next)}
          error={error("", "text", kind.max)}
        />
      );
    case "integer":
    case "area":
      return (
        <NumberInput
          id={id}
          label={label}
          value={typeof value === "number" ? value : null}
          onChange={onChange}
          decimals={kind.kind === "area"}
          error={error("")}
          disabled={disabled}
        />
      );
    case "date":
      return (
        <SurveyTextField
          id={id}
          type="date"
          max={kind.max}
          label={label}
          value={typeof value === "string" ? value : ""}
          onChange={(next) => onChange(next === "" ? null : next)}
          error={error("", "date")}
        />
      );
    case "enum":
      return (
        <Choice
          id={id}
          label={label}
          value={typeof value === "string" ? value : null}
          options={kind.options}
          onChange={onChange}
          error={error("")}
          disabled={disabled}
          placeholder={choose}
        />
      );
    case "fit":
      return (
        <div className="space-y-3">
          <Choice
            id={`${id}-assessment`}
            label={label}
            value={(v.assessment as string | undefined) ?? null}
            options={(["IN_SCOPE", "OUT_OF_SCOPE", "UNDETERMINED"] as const).map((item) => ({ value: item, label: t(`checklist.values.fit.${item}`) }))}
            onChange={(assessment) => set({ assessment, reason: v.reason ?? "" })}
            error={error("assessment")}
            disabled={disabled}
            placeholder={choose}
          />
          {text("reason", t("checklist.fields.fitReason"), v.reason, 1000, 2, (reason) => ({ reason }))}
        </div>
      );
    case "actualAccess":
      return (
        <div className="space-y-3">
          <Choice
            id={`${id}-extent`}
            label={label}
            value={(v.extent as string | undefined) ?? null}
            options={(["ENTERED_ALL", "ENTERED_PART"] as const).map((item) => ({ value: item, label: t(`checklist.values.extent.${item}`) }))}
            onChange={(extent) => set({ extent, note: v.note ?? null })}
            error={error("extent")}
            disabled={disabled}
            placeholder={choose}
          />
          {v.extent === "ENTERED_PART" && text("note", t("checklist.fields.accessNote"), v.note, 500, 2, (note) => ({ note }))}
        </div>
      );
    case "areaCheck":
      return (
        <div className="space-y-3">
          <Choice
            id={`${id}-result`}
            label={t("checklist.fields.checkResult")}
            value={(v.result as string | undefined) ?? null}
            options={(["INSPECTED", "NOT_ENTERED"] as const).map((item) => ({ value: item, label: t(`checklist.values.areaCheck.${item}`) }))}
            onChange={(result) =>
              onChange({ result, noneObserved: null, note: v.note ?? null, notEnteredReason: result === "NOT_ENTERED" ? (v.notEnteredReason ?? "") : null })
            }
            error={error("result")}
            disabled={disabled}
            placeholder={choose}
          />
          {v.result === "INSPECTED" && (
            <>
              <Choice
                id={`${id}-none`}
                label={t("checklist.fields.noneObserved")}
                value={v.noneObserved === true ? "yes" : v.noneObserved === false ? "no" : null}
                options={[
                  { value: "yes", label: t("checklist.fields.nothingSeen") },
                  { value: "no", label: t("checklist.fields.somethingSeen") },
                ]}
                onChange={(next) => set({ noneObserved: next === null ? null : next === "yes" })}
                error={error("noneObserved")}
                disabled={disabled}
                placeholder={choose}
              />
              {v.noneObserved === false && text("note", t("checklist.fields.checkNote"), v.note, 1000, 2, (note) => ({ note }))}
            </>
          )}
          {v.result === "NOT_ENTERED" && (
            <>
              {text("notEnteredReason", t("checklist.fields.notEnteredReason"), v.notEnteredReason, 500, 2, (notEnteredReason) => ({ notEnteredReason }))}
              {text("note", t("checklist.fields.notEnteredNote"), v.note, 1000, 2, (note) => ({ note }), t("checklist.fields.notEnteredNoteHint"))}
            </>
          )}
        </div>
      );
    case "observation":
      return (
        <div className="space-y-3">
          <Choice
            id={`${id}-none`}
            label={label}
            value={v.noneObserved === true ? "yes" : v.noneObserved === false ? "no" : null}
            options={[
              { value: "yes", label: t("checklist.values.noneObserved") },
              { value: "no", label: t("checklist.fields.somethingSeen") },
            ]}
            onChange={(next) => onChange({ noneObserved: next === "yes", note: next === "no" ? (v.note ?? "") : null })}
            error={error("noneObserved")}
            disabled={disabled}
            placeholder={choose}
          />
          {v.noneObserved === false && text("note", t("checklist.fields.restrictionNote"), v.note, 1000, 2, (note) => ({ note }))}
        </div>
      );
    case "rent":
      return (
        <MoneyInput
          id={`${id}-amount`}
          label={label}
          value={v.amount}
          onChange={(amount) => onChange({ amount, currency: "VND", unit: "MONTH" })}
          error={error("amount") ?? error("")}
          disabled={disabled}
        />
      );
    case "deposit":
      return (
        <div className="space-y-3">
          <Choice
            id={`${id}-basis`}
            label={label}
            value={(v.basis as string | undefined) ?? null}
            options={(["MONTHS", "AMOUNT"] as const).map((item) => ({ value: item, label: t(`checklist.values.depositBasis.${item}`) }))}
            onChange={(basis) => onChange({ basis, months: null, amount: null })}
            error={error("basis")}
            disabled={disabled}
            placeholder={choose}
          />
          {v.basis === "MONTHS" && (
            <NumberInput
              id={`${id}-months`}
              label={t("checklist.fields.depositMonths")}
              value={typeof v.months === "number" ? v.months : null}
              onChange={(months) => set({ months })}
              decimals={false}
              error={error("months")}
              disabled={disabled}
            />
          )}
          {v.basis === "AMOUNT" && (
            <MoneyInput
              id={`${id}-amount`}
              label={t("checklist.fields.depositAmount")}
              value={(v.amount as Json | null)?.amount}
              onChange={(amount) => set({ amount: amount === null ? null : { amount, currency: "VND" } })}
              error={error("amount.amount") ?? error("amount")}
              disabled={disabled}
            />
          )}
        </div>
      );
    case "charge":
      return (
        <div className="space-y-3">
          <Choice
            id={`${id}-basis`}
            label={label}
            value={(v.basis as string | undefined) ?? null}
            options={(["AMOUNT", "INCLUDED", "PROVIDER_TARIFF", "NOT_OFFERED"] as const).map((item) => ({
              value: item,
              label: t(`checklist.values.chargeBasis.${item}`),
            }))}
            onChange={(basis) => onChange({ basis, amount: null, chargeUnit: null, note: v.note ?? null })}
            error={error("basis")}
            disabled={disabled}
            placeholder={choose}
          />
          {v.basis === "AMOUNT" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <MoneyInput
                id={`${id}-amount`}
                label={t("checklist.fields.chargeAmount")}
                value={(v.amount as Json | null)?.amount}
                onChange={(amount) => set({ amount: amount === null ? null : { amount, currency: "VND" } })}
                error={error("amount.amount") ?? error("amount")}
                disabled={disabled}
              />
              <Choice
                id={`${id}-unit`}
                label={t("checklist.fields.chargeUnit")}
                value={(v.chargeUnit as string | undefined) ?? null}
                options={CHARGE_UNITS.map((item) => ({ value: item, label: t(`checklist.values.chargeUnit.${item}`) }))}
                onChange={(chargeUnit) => set({ chargeUnit })}
                error={error("chargeUnit")}
                disabled={disabled}
                placeholder={choose}
              />
            </div>
          )}
          {v.basis !== undefined && text("note", t("checklist.fields.chargeNote"), v.note, 200, 1, (note) => ({ note: note === "" ? null : note }))}
        </div>
      );
    case "fees": {
      const fees = Array.isArray(value) ? (value as Json[]) : [];
      const setFee = (index: number, patch: Json) => onChange(fees.map((fee, at) => (at === index ? { ...fee, ...patch } : fee)));
      return (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">{label}</p>
          {fees.map((fee, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-3">
              <SurveyTextField
                id={`${id}-${index}-name`}
                label={t("checklist.fields.feeName")}
                value={typeof fee.name === "string" ? fee.name : ""}
                onChange={(name) => setFee(index, { name })}
                error={error(`${index}.name`, "text", 100)}
              />
              <MoneyInput
                id={`${id}-${index}-amount`}
                label={t("checklist.fields.feeAmount")}
                value={(fee.amount as Json | null)?.amount}
                onChange={(amount) => setFee(index, { amount: amount === null ? null : { amount, currency: "VND" } })}
                error={error(`${index}.amount.amount`) ?? error(`${index}.amount`)}
                disabled={disabled}
              />
              <Choice
                id={`${id}-${index}-unit`}
                label={t("checklist.fields.chargeUnit")}
                value={(fee.chargeUnit as string | undefined) ?? null}
                options={CHARGE_UNITS.map((item) => ({ value: item, label: t(`checklist.values.chargeUnit.${item}`) }))}
                onChange={(chargeUnit) => setFee(index, { chargeUnit })}
                error={error(`${index}.chargeUnit`)}
                disabled={disabled}
                placeholder={choose}
              />
              <div className="sm:col-span-3">
                <Button variant="ghost" className="px-3 py-1" disabled={disabled} onClick={() => onChange(fees.filter((_, at) => at !== index))}>
                  {t("checklist.terms.removeFee")}
                </Button>
              </div>
            </div>
          ))}
          {fees.length < 10 && (
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => onChange([...fees, { name: "", amount: null, chargeUnit: null }])}
            >
              {t("checklist.terms.addFee")}
            </Button>
          )}
          {error("") !== undefined && <p className="text-sm text-rose-600">{error("")}</p>}
        </div>
      );
    }
    case "pets":
      return (
        <div className="space-y-3">
          <Choice
            id={`${id}-policy`}
            label={label}
            value={(v.policy as string | undefined) ?? null}
            options={(["ALLOWED", "NOT_ALLOWED", "CONDITIONAL"] as const).map((item) => ({ value: item, label: t(`checklist.values.pets.${item}`) }))}
            onChange={(policy) => set({ policy, note: v.note ?? null })}
            error={error("policy")}
            disabled={disabled}
            placeholder={choose}
          />
          {v.policy !== undefined && text("note", t("checklist.fields.petsNote"), v.note, 500, 2, (note) => ({ note: note === "" ? null : note }))}
        </div>
      );
  }
}
