"use client";

import { useState } from "react";
import type { z } from "zod";

import { type FieldErrors, fieldErrorsOf } from "../lib/form-state";

type ClientErrors = {
  /** The action's errors these checks were made against: a new action state shows its errors again. */
  source: FieldErrors | undefined;
  /** Each field's problem found on its last blur, or undefined for none. */
  checked: Partial<Record<string, string | undefined>>;
  /** The fields changed since the action answered: their action errors no longer show. */
  changed: readonly string[];
};

/**
 * The field errors of a controlled form (E06S3-P13 (6), the form of `src/features/auth/lib/use-field-errors.ts` over the
 * form's values in place of `FormData`): a blur checks the field with the same schema the action uses; the action's
 * errors show under their fields until that field changes.
 */
export function useFieldErrors(schema: z.ZodType, values: unknown, actionErrors: FieldErrors | undefined) {
  const [client, setClient] = useState<ClientErrors>({ source: actionErrors, checked: {}, changed: [] });
  const current: ClientErrors = client.source === actionErrors ? client : { source: actionErrors, checked: {}, changed: [] };

  function onBlur(field: string) {
    const result = schema.safeParse(values);
    const problem = result.success ? undefined : fieldErrorsOf(result.error)[field];
    setClient({ ...current, checked: { ...current.checked, [field]: problem } });
  }

  function changed(field: string) {
    if (current.changed.includes(field)) return;
    setClient({ ...current, changed: [...current.changed, field] });
  }

  function errorFor(field: string): string | undefined {
    if (field in current.checked) return current.checked[field];
    return current.changed.includes(field) ? undefined : actionErrors?.[field];
  }

  return { onBlur, changed, errorFor };
}
