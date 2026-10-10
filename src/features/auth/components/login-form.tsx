"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { loginAction } from "../actions/login.action";
import { AUTH_ROUTES } from "../constants";
import { initialFormState } from "../lib/form-state";
import { useFieldErrors } from "../lib/use-field-errors";
import { loginSchema } from "../schemas/auth.schema";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(loginAction, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(loginSchema, state.fieldErrors);
  const phoneError = errorFor("username");
  const passwordError = errorFor("password");

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      {state.message && <Alert tone="error">{state.message}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}

      <FormField id="username" label="Phone number" error={phoneError}>
        <Input
          id="username"
          name="username"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0901 234 567"
          required
          defaultValue={state.values?.username}
          invalid={Boolean(phoneError)}
          aria-describedby={describedBy("username", phoneError)}
        />
      </FormField>

      <FormField
        id="password"
        label="Password"
        error={passwordError}
        labelAction={
          <Link href={AUTH_ROUTES.forgotPassword} className="text-sm font-medium text-violet-700 hover:text-violet-800">
            Forgot password?
          </Link>
        }
      >
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          invalid={Boolean(passwordError)}
          aria-describedby={describedBy("password", passwordError)}
        />
      </FormField>

      <SubmitButton>Log in</SubmitButton>
    </form>
  );
}
