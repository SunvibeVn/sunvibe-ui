import { z } from "zod";

import type { FieldErrorKind, FieldErrorKinds, FieldName, FormValues, Intent, PropertyType } from "../types/form";

import { isValidEmail } from "./email";

// Mirrors the server rules of handoff table 2.5 (POST /api/v1/public/owner-intake-requests).
// Issue messages are FieldErrorKind values; lib/field-errors.ts turns them into i18n keys.

export const CONTACT_NAME_MAX = 100;
export const EMAIL_MAX = 254;
export const ADDRESS_DETAIL_MAX = 255;
export const NOTES_MAX = 1000;
export const PREFERRED_CALLBACK_TIME_MAX = 100;
export const ASKING_PRICE_MAX = 999_999_999_999_999;

/** Length limit per field, fed into the {max} placeholder of the tooLong messages. */
export const FIELD_MAX_LENGTH: Partial<Record<FieldName, number>> = {
  contactName: CONTACT_NAME_MAX,
  email: EMAIL_MAX,
  addressDetail: ADDRESS_DETAIL_MAX,
  notes: NOTES_MAX,
  preferredCallbackTime: PREFERRED_CALLBACK_TIME_MAX,
};

// Rental only (brief Q-14, G2 D-45). The API enum still has SALE (reserved), so the form never offers or sends it.
export const INTENTS = ["SHORT_TERM_RENT", "LONG_TERM_RENT"] as const satisfies readonly Intent[];

// The six property types Sunvibe takes, in form order (brief BR-3, G2 D-46, D-47). No "other"; the field stays optional.
export const PROPERTY_TYPES = [
  "HOUSE",
  "WHOLE_BUILDING",
  "VILLA",
  "HOMESTAY",
  "CONDOTEL",
  "APARTMENT",
] as const satisfies readonly PropertyType[];

// Same separators as the server: space, tab, CR, LF, VT, FF (not NBSP, so no \s), dot, dash, parentheses.
const PHONE_SEPARATORS = /[ \t\r\n\v\f.()-]/g;
const PHONE_PATTERN = /^(0|\+84)[1-9][0-9]{8}$/;

export function isValidPhone(value: string): boolean {
  return PHONE_PATTERN.test(value.replace(PHONE_SEPARATORS, ""));
}

const isoDate = z.iso.date();

function isValidPrice(value: string): boolean {
  if (!/^[0-9]+$/.test(value)) return false;
  const amount = Number(value);
  return amount >= 1 && amount <= ASKING_PRICE_MAX;
}

const kind = (k: FieldErrorKind) => ({ error: k });
const notBlank = (value: string) => value.trim() !== "";
const oneOf = (values: readonly string[]) => (value: string) => values.includes(value);
// zod 4.6 `.max()` counts code points; the server counts UTF-16 units (string.length), so check it directly.
const maxUnits = (max: number) => (value: string) => value.length <= max;
const emptyOr = (check: (value: string) => boolean) => (value: string) => value === "" || check(value);

export const ownerIntakeSchema = z.object({
  contactName: z.string().trim().refine(notBlank, kind("required")).refine(maxUnits(CONTACT_NAME_MAX), kind("tooLong")),
  phone: z.string().refine(notBlank, kind("required")).refine(isValidPhone, kind("invalid")),
  // The form sends the trimmed email and omits it when empty.
  email: z.string().trim().refine(maxUnits(EMAIL_MAX), kind("tooLong")).refine(emptyOr(isValidEmail), kind("invalid")),
  intent: z.string().refine(notBlank, kind("required")).refine(oneOf(INTENTS), kind("invalid")),
  provinceCode: z.string().refine(notBlank, kind("required")),
  wardCode: z.string().refine(notBlank, kind("required")),
  addressDetail: z.string().refine(notBlank, kind("required")).refine(maxUnits(ADDRESS_DETAIL_MAX), kind("tooLong")),
  propertyType: z.string().refine(emptyOr(oneOf(PROPERTY_TYPES)), kind("invalid")),
  askingPrice: z.object({ amount: z.string().trim().refine(emptyOr(isValidPrice), kind("invalid")) }),
  availableFrom: z.string().refine(emptyOr((v) => isoDate.safeParse(v).success), kind("invalid")),
  notes: z.string().refine(maxUnits(NOTES_MAX), kind("tooLong")),
  preferredCallbackTime: z.string().refine(maxUnits(PREFERRED_CALLBACK_TIME_MAX), kind("tooLong")),
  consent: z.object({ accepted: z.boolean().refine((accepted) => accepted, kind("invalid")) }),
});

/** Checks the form like the server does; returns the first failing kind per field, `{}` when valid. */
export function validateOwnerIntake(values: FormValues): FieldErrorKinds {
  const result = ownerIntakeSchema.safeParse(values);
  const errors: FieldErrorKinds = {};
  if (result.success) return errors;
  for (const issue of result.error.issues) {
    const field = issue.path.join(".") as FieldName;
    errors[field] ??= issue.message as FieldErrorKind;
  }
  return errors;
}
