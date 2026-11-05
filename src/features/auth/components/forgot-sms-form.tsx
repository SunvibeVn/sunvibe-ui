"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { type FormState, initialFormState, readForm } from "../lib/form-state";
import { passwordResetBrowserDeps } from "../lib/password-reset-browser";
import { requestResetBySms } from "../lib/password-reset-sms-flow";
import { useCookiesWork } from "../lib/use-cookies-work";
import { useFieldErrors } from "../lib/use-field-errors";
import { PHONE_MAX_RAW_LENGTH } from "../schemas/identifier-policy";
import { forgotBySmsSchema } from "../schemas/phone-auth.schema";
import { CookiesRequiredNotice } from "./cookies-required-notice";

/** The SMS tab of `/forgot-password`. Loaded on demand: it reaches the phone parser, which public pages must not load. */
export function ForgotSmsForm() {
  const router = useRouter();
  const cookiesWork = useCookiesWork();
  const [state, formAction] = useActionState(async (_previous: FormState, formData: FormData): Promise<FormState> => {
    const values = readForm(formData, ["phoneNumber"]);
    const outcome = await requestResetBySms(values, passwordResetBrowserDeps());
    if (!("redirect" in outcome)) return outcome;
    router.push(outcome.redirect);
    // Keeps the typed number in the field while the next page loads.
    return { status: "success", values } satisfies FormState;
  }, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(forgotBySmsSchema, state.fieldErrors);
  const error = errorFor("phoneNumber");

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      <CookiesRequiredNotice />
      {state.message && <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>}
      <FormField id="phoneNumber" label="Phone number" error={error}>
        <Input
          id="phoneNumber"
          name="phoneNumber"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={PHONE_MAX_RAW_LENGTH}
          placeholder="0901 234 567"
          required
          defaultValue={state.values?.phoneNumber}
          invalid={Boolean(error)}
          aria-describedby={describedBy("phoneNumber", error)}
        />
      </FormField>
      <SubmitButton disabled={!cookiesWork}>Text me a code</SubmitButton>
    </form>
  );
}
