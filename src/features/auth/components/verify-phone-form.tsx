"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { OtpInput } from "@/components/ui/otp-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { type FormState, initialFormState, readForm } from "../lib/form-state";
import { useCountdown } from "../lib/use-countdown";
import { verifyPhoneDeps } from "../lib/signed-in-browser";
import { type SendCodeState, confirmPhoneCode, sendPhoneCode } from "../lib/verify-phone-flow";

// Both forms use a client function as the form action, with the tab's token through `callApi`.

const initialSendState: SendCodeState = { status: "idle" };

function formatSeconds(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VerifyPhoneForm({ maskedPhone }: { maskedPhone: string }) {
  const router = useRouter();
  const [sendState, sendAction, sending] = useActionState(async (previous: SendCodeState) => {
    const outcome = await sendPhoneCode(verifyPhoneDeps());
    if (!("redirect" in outcome)) return outcome;
    router.push(outcome.redirect);
    return previous;
  }, initialSendState);
  const [confirmState, confirmAction] = useActionState(async (previous: FormState, formData: FormData) => {
    const outcome = await confirmPhoneCode(readForm(formData, ["code"]), verifyPhoneDeps());
    if (!("redirect" in outcome)) return outcome;
    router.push(outcome.redirect);
    return previous;
  }, initialFormState);
  const secondsLeft = useCountdown(sendState.resendAvailableAt);
  const codeSent = sendState.status === "success" || Boolean(sendState.resendAvailableAt);
  const codeError = confirmState.fieldErrors?.code?.[0];
  const waiting = secondsLeft === null || secondsLeft > 0;

  return (
    <div className="space-y-6">
      {sendState.message && <Alert tone={sendState.status === "error" ? "error" : "success"}>{sendState.message}</Alert>}

      {codeSent && (
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
          <SubmitButton>Verify phone number</SubmitButton>
        </form>
      )}

      <form action={sendAction}>
        <Button
          type="submit"
          variant={codeSent ? "ghost" : "primary"}
          fullWidth
          pending={sending}
          disabled={codeSent && waiting}
        >
          {!codeSent
            ? `Send code to ${maskedPhone}`
            : waiting
              ? `Resend code${secondsLeft ? ` in ${formatSeconds(secondsLeft)}` : ""}`
              : "Resend code"}
        </Button>
      </form>
    </div>
  );
}
