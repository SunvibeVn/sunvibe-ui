"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { OtpInput } from "@/components/ui/otp-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { resendSignUpCodeAction, verifySignUpCodeAction, type ResendState } from "../actions/sign-up.action";
import { AUTH_ROUTES } from "../constants";
import { initialFormState } from "../lib/form-state";
import { useCountdown } from "../lib/use-countdown";

function formatSeconds(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Sign-up step 2: the SMS code. The code was already sent in step 1, so the boxes show at once. */
export function SignUpVerifyForm({
  maskedPhone,
  resendAvailableAt,
}: {
  maskedPhone: string;
  resendAvailableAt?: string;
}) {
  const [confirmState, confirmAction] = useActionState(verifySignUpCodeAction, initialFormState);
  const initialResend: ResendState = { status: "idle", resendAvailableAt };
  const [resendState, resendAction, resending] = useActionState(resendSignUpCodeAction, initialResend);
  const secondsLeft = useCountdown(resendState.resendAvailableAt);
  const waiting = secondsLeft === null || secondsLeft > 0;
  const codeError = confirmState.fieldErrors?.code?.[0];

  return (
    <div className="space-y-5">
      <p className="text-center text-sm text-slate-600">
        We sent a 6-digit code to <span className="font-semibold text-slate-800">{maskedPhone}</span>.{" "}
        <Link href={AUTH_ROUTES.signUp} className="font-semibold text-violet-700 hover:text-violet-800">
          Wrong number?
        </Link>
      </p>

      {resendState.message && (
        <Alert tone={resendState.status === "error" ? "error" : "success"}>{resendState.message}</Alert>
      )}

      <form action={confirmAction} className="space-y-5">
        {confirmState.message && <Alert tone="error">{confirmState.message}</Alert>}
        <FormField id="code" label="Verification code" error={codeError}>
          <OtpInput
            id="code"
            name="code"
            label="Verification code"
            autoFocus
            invalid={Boolean(codeError)}
            describedBy={codeError ? "code-error" : undefined}
          />
        </FormField>
        <SubmitButton>Verify</SubmitButton>
      </form>

      <form action={resendAction}>
        <Button type="submit" variant="ghost" fullWidth pending={resending} disabled={waiting}>
          {waiting ? `Resend code${secondsLeft ? ` in ${formatSeconds(secondsLeft)}` : ""}` : "Resend code"}
        </Button>
      </form>
    </div>
  );
}
