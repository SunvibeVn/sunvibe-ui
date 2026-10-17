import { z } from "zod";
import { type FieldError, type PublicApiHttpError, type PublicApiNetworkError } from "@/lib/api";
import { type AuthErrorScreen, authErrorText } from "./auth-error-text";

export type FieldErrors = Partial<Record<string, string[]>>;

/** What every auth form action returns to its form through `useActionState`. */
export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Submitted values to refill the form after an error. Never contains passwords. */
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };

export function readForm<const K extends string>(formData: FormData, fields: readonly K[]): Record<K, string> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = formData.get(field);
      return [field, typeof value === "string" ? value : ""];
    }),
  ) as Record<K, string>;
}

export function validationError(error: z.ZodError, values?: Record<string, string>): FormState {
  return { status: "error", fieldErrors: z.flattenError(error).fieldErrors as FieldErrors, values };
}

function toFieldErrors(errors: readonly FieldError[]): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const { field, message } of errors) {
    (fieldErrors[field] ??= []).push(message);
  }
  return fieldErrors;
}

/**
 * The form state for a failed browser call: the API's field errors under their fields, otherwise the screen's text
 * for the error code. `values` refill the form and must never hold a password. Logs nothing.
 */
export function formStateFromResult(
  result: PublicApiHttpError | PublicApiNetworkError,
  { values, screen }: { values?: Record<string, string>; screen: AuthErrorScreen },
): FormState {
  if (result.kind === "http" && result.fieldErrors.length > 0) {
    return { status: "error", fieldErrors: toFieldErrors(result.fieldErrors), values };
  }
  return { status: "error", message: authErrorText(result, screen), values };
}
