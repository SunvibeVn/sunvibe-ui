"use client";

import { useState, type FocusEvent } from "react";
import { z } from "zod";
import type { FieldErrors } from "./form-state";

/**
 * Client-side, per-field validation on blur with the same zod schema the
 * form action uses. Server errors show until the user edits that field.
 * A new server response (new `serverErrors` object) resets the client state.
 */
export function useFieldErrors(schema: z.ZodType, serverErrors?: FieldErrors) {
  const [client, setClient] = useState<{ source?: FieldErrors; errors: Record<string, string | undefined> }>({
    source: serverErrors,
    errors: {},
  });
  const current = client.source === serverErrors ? client.errors : {};

  function onBlur(event: FocusEvent<HTMLFormElement>) {
    // React types the target as the form itself; at runtime it is the field that lost focus.
    const field: EventTarget = event.target;
    if (!(field instanceof HTMLInputElement) || !field.name || field.type === "hidden") return;
    const values = Object.fromEntries(
      [...new FormData(event.currentTarget).entries()].map(([key, value]) => [key, String(value)]),
    );
    const result = schema.safeParse(values);
    const message = result.success
      ? undefined
      : (z.flattenError(result.error).fieldErrors as FieldErrors)[field.name]?.[0];
    setClient({ source: serverErrors, errors: { ...current, [field.name]: message } });
  }

  function errorFor(name: string) {
    return name in current ? current[name] : serverErrors?.[name]?.[0];
  }

  return { onBlur, errorFor };
}
