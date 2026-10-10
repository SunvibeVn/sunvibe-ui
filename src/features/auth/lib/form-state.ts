import { z } from "zod";
import { ApiError } from "@/lib/api";

export type FieldErrors = Partial<Record<string, string[]>>;

/** What every auth Server Action returns to its form through `useActionState`. */
export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Submitted values to refill the form after an error. Never contains passwords. */
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };

const GENERIC_ERROR = "We couldn't reach the server. Please try again.";

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

type ErrorOptions = {
  values?: Record<string, string>;
  /** Message to show for a given HTTP status, e.g. `{ 401: "Wrong password" }`. */
  overrides?: Partial<Record<number, string>>;
};

export function formStateFromError(error: unknown, { values, overrides = {} }: ErrorOptions = {}): FormState {
  const fail = (message: string): FormState => ({ status: "error", message, values });

  if (!(error instanceof ApiError)) {
    console.error("[auth] Backend call failed:", error instanceof Error ? error.message : error);
    return fail(GENERIC_ERROR);
  }

  const override = overrides[error.status];
  if (override) return fail(override);

  if (error.fieldErrors.length > 0) {
    const fieldErrors: FieldErrors = {};
    for (const { field, message } of error.fieldErrors) {
      (fieldErrors[field] ??= []).push(message);
    }
    return { status: "error", fieldErrors, values };
  }

  switch (error.status) {
    case 400:
      return fail("The code is incorrect or has expired.");
    case 423:
      return fail(`Too many failed attempts. Try again in ${formatWait(error.retryAfterSeconds)}.`);
    case 429:
      return fail(`Too many requests. Please wait ${formatWait(error.retryAfterSeconds)} and try again.`);
  }

  if (error.status >= 500) {
    console.error(`[auth] Backend answered ${error.status}`);
    return fail(GENERIC_ERROR);
  }
  return fail(error.message || GENERIC_ERROR);
}

function formatWait(seconds?: number) {
  if (!seconds) return "a few minutes";
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
