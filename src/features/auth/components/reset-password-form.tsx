"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { OtpInput } from "@/components/ui/otp-input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { resetPasswordAction } from "../actions/reset-password.action";
import { initialFormState } from "../lib/form-state";
import { useFieldErrors } from "../lib/use-field-errors";
import { resetPasswordFieldsSchema } from "../schemas/auth.schema";
import { PasswordChecklist } from "./password-checklist";

export function ResetPasswordForm({ token, via }: { token?: string; via: "email" | "sms" }) {
  const [state, formAction] = useActionState(resetPasswordAction, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(resetPasswordFieldsSchema.omit({ resetToken: true }), state.fieldErrors);
  const [password, setPassword] = useState("");
  const codeError = state.fieldErrors?.otpCode?.[0];
  const passwordError = errorFor("newPassword");
  const confirmError = errorFor("confirmPassword");

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      {state.message && <Alert tone="error">{state.message}</Alert>}
      {token && <input type="hidden" name="resetToken" value={token} />}

      <FormField
        id="otpCode"
        label={via === "sms" ? "Code from the SMS" : "Code from the email"}
        error={codeError}
      >
        <OtpInput
          id="otpCode"
          name="otpCode"
          label="Reset code"
          autoFocus
          invalid={Boolean(codeError)}
          describedBy={codeError ? "otpCode-error" : undefined}
        />
      </FormField>

      <FormField id="newPassword" label="New password" error={passwordError} hint={<PasswordChecklist id="new-password-rules" value={password} />}>
        <PasswordInput
          id="newPassword"
          name="newPassword"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          invalid={Boolean(passwordError)}
          aria-describedby={passwordError ? "newPassword-error" : "newPassword-hint"}
        />
      </FormField>

      <FormField id="confirmPassword" label="Confirm new password" error={confirmError}>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          invalid={Boolean(confirmError)}
          aria-describedby={describedBy("confirmPassword", confirmError)}
        />
      </FormField>

      <SubmitButton>Set new password</SubmitButton>
    </form>
  );
}
