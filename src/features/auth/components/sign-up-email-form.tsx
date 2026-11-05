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
import { signUpEmailSchema } from "../schemas/auth.schema";
import { EMAIL_MAX_RAW_LENGTH } from "../schemas/identifier-policy";
import { CookiesRequiredNotice } from "./cookies-required-notice";

/** Sign-up step 1: just the address, which receives the code. */
export function SignUpEmailForm() {
  const router = useRouter();
  const cookiesWork = useCookiesWork();
  // A client function as the form action: the form still renders on the server, and React replays a submit made
  // before hydration through it.
  const [state, formAction] = useActionState(async (previous: FormState, formData: FormData) => {
    const outcome = await startSignUp(readForm(formData, ["email"]), signUpBrowserDeps());
    if (!("redirect" in outcome)) return outcome;
    router.push(outcome.redirect);
    return { status: "success", values: previous.values } satisfies FormState;
  }, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(signUpEmailSchema, state.fieldErrors);
  const error = errorFor("email");

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      <CookiesRequiredNotice />
      {state.message && <Alert tone="error">{state.message}</Alert>}

      <FormField id="email" label="Email" error={error} hint="We'll email you a 6-digit code to verify it.">
        <Input
          compact
          id="email"
          name="email"
          type="text"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={EMAIL_MAX_RAW_LENGTH}
          placeholder="name@example.com"
          required
          defaultValue={state.values?.email}
          invalid={Boolean(error)}
          aria-describedby={describedBy("email", error, true)}
        />
      </FormField>

      <SubmitButton disabled={!cookiesWork}>
        Send verification code <ArrowRightIcon size={16} />
      </SubmitButton>
    </form>
  );
}
