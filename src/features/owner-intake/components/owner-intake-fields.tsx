"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { describedBy, FormField } from "@/components/ui/form-field";
import { Input, type InputProps } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { fieldElementId, type FieldErrorMessage } from "../lib/field-errors";
import { applyCatalogChange } from "../lib/form-values";
import { PRICE_UNIT_BY_INTENT } from "../lib/to-request-body";
import { INTENTS, NOTES_MAX, PROPERTY_TYPES } from "../schemas/owner-intake-schema";
import type { FieldName, FormValues } from "../types/form";

import { CatalogSelects } from "./catalog-selects";

type FieldProps = {
  field: FieldName;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  disabled?: boolean;
};

function TextField({
  field,
  label,
  value,
  onChange,
  error,
  hint,
  required,
  disabled,
  ...inputProps
}: FieldProps & Pick<InputProps, "type" | "inputMode" | "autoComplete" | "placeholder">) {
  const id = fieldElementId(field);
  return (
    <FormField id={id} label={label} error={error} hint={hint} required={required}>
      <Input
        id={id}
        name={field}
        value={value}
        required={required}
        disabled={disabled}
        invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, Boolean(hint))}
        onChange={(event) => onChange(event.target.value)}
        {...inputProps}
      />
    </FormField>
  );
}

function TextareaField({ field, label, value, onChange, error, hint, required, disabled }: FieldProps) {
  const id = fieldElementId(field);
  return (
    <FormField id={id} label={label} error={error} hint={hint} required={required}>
      <Textarea
        id={id}
        name={field}
        rows={4}
        value={value}
        required={required}
        disabled={disabled}
        invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, Boolean(hint))}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}

function SelectField({
  field,
  label,
  value,
  onChange,
  error,
  hint,
  required,
  disabled,
  placeholder,
  options,
}: FieldProps & { placeholder: string; options: { value: string; label: string }[] }) {
  const id = fieldElementId(field);
  return (
    <FormField id={id} label={label} error={error} hint={hint} required={required}>
      <Select
        id={id}
        name={field}
        value={value}
        required={required}
        disabled={disabled}
        invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, Boolean(hint))}
        onChange={(event) => onChange(event.target.value)}
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

export type OwnerIntakeFieldsProps = {
  values: FormValues;
  /** Gets an updater, like a React state setter; the container owns the state. */
  onChange: (update: (values: FormValues) => FormValues) => void;
  /** Message per field, from fieldErrorMessages (client) or the server `errors[].field`. */
  errors?: Partial<Record<FieldName, FieldErrorMessage>>;
  /** Read-only while submitting. */
  disabled?: boolean;
  /** Forwarded from CatalogSelects: keep the submit disabled while no ward can be chosen. */
  onCatalogReadyChange?: (ready: boolean) => void;
  /** Rendered right after the address (the map pin), so the visual order matches FIELD_ORDER. */
  location?: ReactNode;
};

/** Every input of the owner intake form except the map pin and the consent block. */
export function OwnerIntakeFields({
  values,
  onChange,
  errors = {},
  disabled,
  onCatalogReadyChange,
  location,
}: OwnerIntakeFieldsProps) {
  const t = useTranslations("OwnerIntake");
  // Message keys come from fieldErrorMessage, which checked them with t.has (or fell back to errors.generic).
  const errorText = (field: FieldName) => {
    const message = errors[field];
    return message && t(message.key as Parameters<typeof t>[0], message.values);
  };
  const set =
    <K extends keyof FormValues>(key: K) =>
    (value: FormValues[K]) =>
      onChange((current) => ({ ...current, [key]: value }));
  const common = (field: FieldName) => ({ field, error: errorText(field), disabled });

  const unit = values.intent === "" ? undefined : PRICE_UNIT_BY_INTENT[values.intent];

  return (
    <div className="space-y-4">
      <TextField
        {...common("contactName")}
        required
        label={t("fields.contactName.label")}
        placeholder={t("fields.contactName.placeholder")}
        autoComplete="name"
        value={values.contactName}
        onChange={set("contactName")}
      />
      <TextField
        {...common("phone")}
        required
        type="tel"
        autoComplete="tel"
        label={t("fields.phone.label")}
        hint={t("fields.phone.hint")}
        value={values.phone}
        onChange={set("phone")}
      />
      <TextField
        {...common("email")}
        type="email"
        autoComplete="email"
        label={t("fields.email.label")}
        hint={t("fields.email.hint")}
        value={values.email}
        onChange={set("email")}
      />
      <SelectField
        {...common("intent")}
        required
        label={t("fields.intent.label")}
        placeholder={t("fields.intent.placeholder")}
        options={INTENTS.map((intent) => ({ value: intent, label: t(`fields.intent.options.${intent}`) }))}
        value={values.intent}
        onChange={(value) => set("intent")(value as FormValues["intent"])}
      />
      <CatalogSelects
        provinceCode={values.provinceCode}
        wardCode={values.wardCode}
        onChange={(change) => onChange((current) => applyCatalogChange(current, change))}
        onReadyChange={onCatalogReadyChange}
        disabled={disabled}
        provinceError={errorText("provinceCode")}
        wardError={errorText("wardCode")}
      />
      <TextField
        {...common("addressDetail")}
        required
        autoComplete="street-address"
        label={t("fields.addressDetail.label")}
        hint={t("fields.addressDetail.hint")}
        value={values.addressDetail}
        onChange={set("addressDetail")}
      />
      {location}
      <SelectField
        {...common("propertyType")}
        label={t("fields.propertyType.label")}
        placeholder={t("fields.propertyType.placeholder")}
        options={PROPERTY_TYPES.map((type) => ({ value: type, label: t(`fields.propertyType.options.${type}`) }))}
        value={values.propertyType}
        onChange={(value) => set("propertyType")(value as FormValues["propertyType"])}
      />
      <TextField
        {...common("askingPrice.amount")}
        inputMode="numeric"
        label={
          unit
            ? t("fields.askingPrice.labelWithUnit", { unit: t(`fields.askingPrice.unit.${unit}`) })
            : t("fields.askingPrice.label")
        }
        hint={t("fields.askingPrice.hint")}
        value={values.askingPrice.amount}
        onChange={(amount) => set("askingPrice")({ amount })}
      />
      <TextField
        {...common("availableFrom")}
        type="date"
        label={t("fields.availableFrom.label")}
        value={values.availableFrom}
        onChange={set("availableFrom")}
      />
      <TextareaField
        {...common("notes")}
        label={t("fields.notes.label")}
        hint={t("fields.notes.hint", { max: NOTES_MAX })}
        value={values.notes}
        onChange={set("notes")}
      />
      <TextField
        {...common("preferredCallbackTime")}
        label={t("fields.preferredCallbackTime.label")}
        placeholder={t("fields.preferredCallbackTime.placeholder")}
        value={values.preferredCallbackTime}
        onChange={set("preferredCallbackTime")}
      />
    </div>
  );
}
