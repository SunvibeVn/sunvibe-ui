"use client";

import { useActionState } from "react";
import { ArrowRightIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { startSignUpAction } from "../actions/sign-up.action";
import { initialFormState } from "../lib/form-state";
import { useFieldErrors } from "../lib/use-field-errors";
import { signUpPhoneSchema } from "../schemas/auth.schema";

/** Sign-up step 1: just the phone number, which receives the SMS code. */
export function SignUpPhoneForm() {
  const [state, formAction] = useActionState(startSignUpAction, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(signUpPhoneSchema, state.fieldErrors);
  const error = errorFor("username");

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      {state.message && <Alert tone="error">{state.message}</Alert>}

      <FormField id="username" label="Phone number" error={error} hint="We'll text you a 6-digit code to verify it.">
        <Input
          compact
          id="username"
          name="username"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0901 234 567"
          required
          defaultValue={state.values?.username}
          invalid={Boolean(error)}
          aria-describedby={describedBy("username", error, true)}
        />
      </FormField>

      <SubmitButton>
        Send verification code <ArrowRightIcon size={16} />
      </SubmitButton>
    </form>
  );
}
