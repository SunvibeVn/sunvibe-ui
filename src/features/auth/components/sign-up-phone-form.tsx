"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { ArrowRightIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { type FormState, initialFormState, readForm } from "../lib/form-state";
import { signUpBrowserDeps } from "../lib/sign-up-browser";
import { startSignUp } from "../lib/sign-up-flow";
import { useCookiesWork } from "../lib/use-cookies-work";
import { useFieldErrors } from "../lib/use-field-errors";
import { signUpPhoneSchema } from "../schemas/auth.schema";
import { CookiesRequiredNotice } from "./cookies-required-notice";

/** Sign-up step 1: just the phone number, which receives the SMS code. */
export function SignUpPhoneForm() {
  const router = useRouter();
  const cookiesWork = useCookiesWork();
  // A client function as the form action: the form still renders on the server, and React replays a submit made
  // before hydration through it.
  const [state, formAction] = useActionState(async (previous: FormState, formData: FormData) => {
    const outcome = await startSignUp(readForm(formData, ["username"]), signUpBrowserDeps());
    if (!("redirect" in outcome)) return outcome;
    router.push(outcome.redirect);
    return { status: "success", values: previous.values } satisfies FormState;
  }, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(signUpPhoneSchema, state.fieldErrors);
  const error = errorFor("username");

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      <CookiesRequiredNotice />
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

      <SubmitButton disabled={!cookiesWork}>
        Send verification code <ArrowRightIcon size={16} />
      </SubmitButton>
    </form>
  );
}
