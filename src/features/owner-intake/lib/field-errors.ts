import { FIELD_MAX_LENGTH } from "../schemas/owner-intake-schema";
import type { FieldErrorKinds, FieldName } from "../types/form";

/** Field paths as the server reports them in `errors[].field`, in form order (first one gets the focus). */
export const FIELD_ORDER = [
  "contactName",
  "phone",
  "email",
  "intent",
  "provinceCode",
  "wardCode",
  "addressDetail",
  "latitude",
  "longitude",
  "propertyType",
  "askingPrice.amount",
  "availableFrom",
  "notes",
  "preferredCallbackTime",
  "consent.accepted",
] as const;

/** Key in the OwnerIntake namespace used when a field or kind has no message of its own. */
export const GENERIC_ERROR_KEY = "errors.generic";

/** A message key in the OwnerIntake namespace plus its ICU values. */
export type FieldErrorMessage = { key: string; values?: { max: number } };

/**
 * Maps a field path (client validation or server `errors[].field`) and a kind to its message under
 * OwnerIntake.errors.fields; falls back to errors.generic when no such message exists. Pass next-intl `t.has`.
 */
export function fieldErrorMessage(field: string, kind: string, has: (key: string) => boolean): FieldErrorMessage {
  const key = `errors.fields.${field}.${kind}`;
  if (!has(key)) return { key: GENERIC_ERROR_KEY };
  const max = FIELD_MAX_LENGTH[field as FieldName];
  return kind === "tooLong" && max !== undefined ? { key, values: { max } } : { key };
}

/** Message per field for the kinds that validateOwnerIntake returned. */
export function fieldErrorMessages(
  errors: FieldErrorKinds,
  has: (key: string) => boolean,
): Partial<Record<FieldName, FieldErrorMessage>> {
  const messages: Partial<Record<FieldName, FieldErrorMessage>> = {};
  for (const field of FIELD_ORDER) {
    const kind = errors[field];
    if (kind) messages[field] = fieldErrorMessage(field, kind, has);
  }
  return messages;
}

/** First field in form order that has an error, to move the focus there. */
export function firstInvalidField(errors: Partial<Record<FieldName, unknown>>): FieldName | undefined {
  return FIELD_ORDER.find((field) => errors[field] !== undefined);
}

/** DOM id of the control of a field path ("askingPrice.amount" -> "askingPrice-amount"). */
export function fieldElementId(field: FieldName): string {
  return field.replace(/\./g, "-");
}
