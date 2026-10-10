"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { registerAction } from "../actions/register.action";
import { initialFormState } from "../lib/form-state";
import { useFieldErrors } from "../lib/use-field-errors";
import { registerSchema } from "../schemas/auth.schema";
import { PasswordChecklist } from "./password-checklist";

export function SignUpForm() {
  const [state, formAction] = useActionState(registerAction, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(registerSchema, state.fieldErrors);
  const [password, setPassword] = useState("");
  const error = {
    fullName: errorFor("fullName"),
    username: errorFor("username"),
    email: errorFor("email"),
    idCardNumber: errorFor("idCardNumber"),
    password: errorFor("password"),
    confirmPassword: errorFor("confirmPassword"),
  };

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      {state.message && <Alert tone="error">{state.message}</Alert>}

      <FormField id="fullName" label="Full name" error={error.fullName}>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          defaultValue={state.values?.fullName}
          invalid={Boolean(error.fullName)}
          aria-describedby={describedBy("fullName", error.fullName)}
        />
      </FormField>

      <FormField id="username" label="Phone number" error={error.username} hint="You'll log in with this number and verify it by SMS.">
        <Input
          id="username"
          name="username"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0901 234 567"
          required
          defaultValue={state.values?.username}
          invalid={Boolean(error.username)}
          aria-describedby={describedBy("username", error.username, true)}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField id="email" label="Email" optional error={error.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.values?.email}
            invalid={Boolean(error.email)}
            aria-describedby={describedBy("email", error.email)}
          />
        </FormField>
        <FormField id="idCardNumber" label="ID card (CMND/CCCD)" optional error={error.idCardNumber}>
          <Input
            id="idCardNumber"
            name="idCardNumber"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={state.values?.idCardNumber}
            invalid={Boolean(error.idCardNumber)}
            aria-describedby={describedBy("idCardNumber", error.idCardNumber)}
          />
        </FormField>
      </div>

      <FormField id="password" label="Password" error={error.password} hint={<PasswordChecklist id="password-rules" value={password} />}>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          invalid={Boolean(error.password)}
          aria-describedby={error.password ? "password-error" : "password-hint"}
        />
      </FormField>

      <FormField id="confirmPassword" label="Confirm password" error={error.confirmPassword}>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          invalid={Boolean(error.confirmPassword)}
          aria-describedby={describedBy("confirmPassword", error.confirmPassword)}
        />
      </FormField>

      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}
