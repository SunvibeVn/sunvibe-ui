"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { OtpInput } from "@/components/ui/otp-input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState, readForm } from "../lib/form-state";
import { completeReset, type ResetState } from "../lib/password-reset-flow";
import { leaveAfterReset, passwordResetBrowserDeps } from "../lib/password-reset-browser";
import { useFieldErrors } from "../lib/use-field-errors";
import { resetPasswordFieldsSchema } from "../schemas/auth.schema";
import { PasswordChecklist } from "./password-checklist";
import { ResetLinkInvalid } from "./reset-link-invalid";

export function ResetPasswordForm({ via }: { via: "email" | "sms" }) {
  // A client function as the form action: React renders it as a non-submitting `javascript:` action and replays a
  // submit made before hydration, so no password or code lands in a URL. The reset token comes from this tab's
  // storage, never from a form field.
  const [state, formAction] = useActionState<ResetState, FormData>(async (_previous, formData) => {
    const outcome = await completeReset(
      readForm(formData, ["otpCode", "newPassword", "confirmPassword"]),
      passwordResetBrowserDeps(),
    );
    return leaveAfterReset(outcome);
  }, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(resetPasswordFieldsSchema.omit({ resetToken: true }), state.fieldErrors);
  const [password, setPassword] = useState("");
  const codeError = state.fieldErrors?.otpCode?.[0];
  const passwordError = errorFor("newPassword");
  const confirmError = errorFor("confirmPassword");

  // A used or refused token cannot be tried again: a change of the password or the email ends it too.
  if (state.tokenGone) return <ResetLinkInvalid />;

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      {state.message && <Alert tone="error">{state.message}</Alert>}

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
