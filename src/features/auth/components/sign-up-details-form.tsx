"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { type FormState, initialFormState, readForm } from "../lib/form-state";
import { signUpBrowserDeps } from "../lib/sign-up-browser";
import { completeSignUp } from "../lib/sign-up-flow";
import { useFieldErrors } from "../lib/use-field-errors";
import { signUpDetailsSchema } from "../schemas/auth.schema";

/**
 * Sign-up step 3: name and password for the phone number that was just verified.
 * The number itself is not a field: the flow takes it from this tab's sign-up progress.
 */
export function SignUpDetailsForm({ maskedPhone }: { maskedPhone: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(async (previous: FormState, formData: FormData) => {
    const values = readForm(formData, ["fullName", "password", "confirmPassword"]);
    const outcome = await completeSignUp(values, signUpBrowserDeps());
    if (!("redirect" in outcome)) return outcome;
    router.replace(outcome.redirect);
    return { status: "success", values: previous.values } satisfies FormState;
  }, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(signUpDetailsSchema, state.fieldErrors);
  const [agreed, setAgreed] = useState(false);
  const [showTermsError, setShowTermsError] = useState(false);
  const error = {
    fullName: errorFor("fullName"),
    password: errorFor("password"),
    confirmPassword: errorFor("confirmPassword"),
  };

  return (
    <form
      action={formAction}
      onBlur={onBlur}
      onSubmit={(event) => {
        // Terms are a UI-only consent: the server never receives them, so block submit here.
        if (!agreed) {
          event.preventDefault();
          setShowTermsError(true);
        }
      }}
      noValidate
      className="space-y-5"
    >
      {state.message && <Alert tone="error">{state.message}</Alert>}

      <p className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
        <CheckIcon size={16} />
        {maskedPhone} is verified
      </p>

      <FormField id="fullName" label="Full name" error={error.fullName}>
        <Input
          compact
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          defaultValue={state.values?.fullName}
          invalid={Boolean(error.fullName)}
          aria-describedby={describedBy("fullName", error.fullName)}
        />
      </FormField>

      <FormField id="password" label="Password" error={error.password}>
        <PasswordInput
          compact
          id="password"
          name="password"
          autoComplete="new-password"
          required
          invalid={Boolean(error.password)}
          aria-describedby={describedBy("password", error.password)}
        />
      </FormField>

      <FormField id="confirmPassword" label="Confirm password" error={error.confirmPassword}>
        <PasswordInput
          compact
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          invalid={Boolean(error.confirmPassword)}
          aria-describedby={describedBy("confirmPassword", error.confirmPassword)}
        />
      </FormField>

      <div>
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => {
              setAgreed(event.target.checked);
              if (event.target.checked) setShowTermsError(false);
            }}
            aria-invalid={showTermsError || undefined}
            aria-describedby={showTermsError ? "terms-error" : undefined}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-orange-600"
          />
          <span>I agree to the Terms &amp; Privacy Policy</span>
        </label>
        {showTermsError && (
          <p id="terms-error" className="mt-1.5 text-sm text-rose-600">
            Please accept the Terms &amp; Privacy Policy to continue.
          </p>
        )}
      </div>

      <SubmitButton>
        Create account <ArrowRightIcon size={16} />
      </SubmitButton>
    </form>
  );
}
