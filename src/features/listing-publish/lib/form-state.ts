import type { z } from "zod";

import type { ListingKey } from "./revision-text";

/** A field to its problem code, read as `freshness.form.errors.<code>` (E06S3-P13 (2)). */
export type FieldErrors = Partial<Record<string, string>>;

/**
 * What a form action of listing-publish returns to its form through `useActionState`: a sentence for the whole form
 * (`messageKey`, a key of the `ListingPublish` namespace, never the server's text) or the problems of its fields.
 */
export type FormState = { status: "idle" | "error" | "success"; messageKey?: ListingKey; fieldErrors?: FieldErrors };

export const initialFormState: FormState = { status: "idle" };

/** The problem of the first issue of each field, by the first segment of its path. */
export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (!(field in fieldErrors)) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

export function invalidState(fieldErrors: FieldErrors): FormState {
  return { status: "error", fieldErrors };
}

export function messageState(messageKey: ListingKey): FormState {
  return { status: "error", messageKey };
}

export function successState(): FormState {
  return { status: "success" };
}
