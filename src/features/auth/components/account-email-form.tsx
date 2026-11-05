"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRightIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { OtpInput } from "@/components/ui/otp-input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { AUTH_ROUTES } from "../constants";
import {
  type BindConfirmState,
  type BindSendState,
  type BindStep,
  confirmBindCode,
  resendBindCode,
  sendBindCode,
} from "../lib/account-email-flow";
import { type MeResponse, readMe } from "../lib/account-flow";
import { englishSessionTexts } from "../lib/english-session-texts";
import { type FormState, initialFormState, readForm } from "../lib/form-state";
import { accountDeps, accountEmailDeps } from "../lib/signed-in-browser";
import { useCookiesWork } from "../lib/use-cookies-work";
import { useCountdown } from "../lib/use-countdown";
import { useFieldErrors } from "../lib/use-field-errors";
import { useSignedInLoad } from "../lib/use-signed-in-load";
import { emailBindSendSchema } from "../schemas/auth.schema";
import { EMAIL_MAX_RAW_LENGTH } from "../schemas/identifier-policy";
import { useSession } from "../session/use-session";
import { CookiesRequiredNotice } from "./cookies-required-notice";
import { FormSkeleton } from "./form-skeleton";
import { LoadError } from "./load-error";
import { RequireSession } from "./require-session";

// The page's state lives in this component's memory only (auth-email-access spec 6.2): a reload starts over, and no
// address, code or password stays in the tab.

/** `/account/email`: bind an email to the account, or replace the one it has. */
export function AccountEmailSection() {
  return (
    <RequireSession texts={englishSessionTexts}>
      <AccountEmailForUser />
    </RequireSession>
  );
}

/** Starts over for another signed-in user: nothing typed for one account reaches the next one. */
function AccountEmailForUser() {
  const { user } = useSession();
  return <AccountEmailContent key={user?.userId ?? ""} />;
}

const loadProfile = () => readMe(accountDeps());

function AccountEmailContent() {
  const { view, retry } = useSignedInLoad(loadProfile);
  if (view.kind === "loading") return <FormSkeleton fields={2} />;
  if (view.kind === "error") return <LoadError onRetry={retry} />;
  // RequireSession shows the session's state (signed out, unavailable) from the store.
  if (view.kind === "none") return null;
  return <EmailBinding me={view.me} />;
}

function EmailBinding({ me }: { me: MeResponse }) {
  const [step, setStep] = useState<BindStep | null>(null);
  // What the address step starts from when the flow comes back to it; the counter gives it a fresh form.
  const [restart, setRestart] = useState<{ state: FormState; count: number }>({ state: initialFormState, count: 0 });
  const replacing = Boolean(me.email && me.emailVerified);

  function backToAddress(state: FormState) {
    setStep(null);
    setRestart(({ count }) => ({ state, count: count + 1 }));
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-semibold text-navy-950">{replacing ? "Change your email" : "Add your email"}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {replacing
          ? "You'll log in with the new email. We'll tell your current email about the change, and other devices are signed out."
          : "You'll log in with this email and use it to recover your password. Other devices are signed out."}
      </p>
      {replacing && <p className="mt-3 text-sm break-all text-slate-800">Current email: {me.email}</p>}

      <div className="mt-6">
        {step ? (
          <BindCodeForm step={step} onBack={backToAddress} />
        ) : (
          <BindAddressForm key={restart.count} initial={restart.state} replacing={replacing} onSent={setStep} />
        )}
      </div>

      <p className="mt-6 text-center text-sm">
        <Link href={AUTH_ROUTES.account} className="font-semibold text-violet-700 hover:text-violet-800">
          Back to your account
        </Link>
      </p>
    </section>
  );
}

function BindAddressForm({
  initial,
  replacing,
  onSent,
}: {
  initial: FormState;
  replacing: boolean;
  onSent(step: BindStep): void;
}) {
  const cookiesWork = useCookiesWork();
  // A client function as the form action: React renders it as a non-submitting `javascript:` action and replays a
  // submit made before hydration, so the password never lands in a URL.
  const [state, formAction] = useActionState<BindSendState, FormData>(async (_previous, formData) => {
    const outcome = await sendBindCode(readForm(formData, ["newEmail", "currentPassword"]), accountEmailDeps());
    if (outcome.step) onSent(outcome.step);
    return outcome;
  }, initial);
  const { onBlur, errorFor } = useFieldErrors(emailBindSendSchema, state.fieldErrors);
  const emailError = errorFor("newEmail");
  const passwordError = errorFor("currentPassword");

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      <CookiesRequiredNotice />
      {state.message && <Alert tone="error">{state.message}</Alert>}

      <FormField id="newEmail" label={replacing ? "New email" : "Email"} error={emailError}>
        <Input
          compact
          id="newEmail"
          name="newEmail"
          type="text"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={EMAIL_MAX_RAW_LENGTH}
          placeholder="name@example.com"
          required
          defaultValue={state.values?.newEmail}
          invalid={Boolean(emailError)}
          aria-describedby={describedBy("newEmail", emailError)}
        />
      </FormField>

      <FormField id="currentPassword" label="Current password" error={passwordError}>
        <PasswordInput
          compact
          id="currentPassword"
          name="currentPassword"
          autoComplete="current-password"
          required
          invalid={Boolean(passwordError)}
          aria-describedby={describedBy("currentPassword", passwordError)}
        />
      </FormField>

      <SubmitButton disabled={!cookiesWork}>
        Send verification code <ArrowRightIcon size={16} />
      </SubmitButton>
    </form>
  );
}

function formatSeconds(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function BindCodeForm({ step, onBack }: { step: BindStep; onBack(state: FormState): void }) {
  const cookiesWork = useCookiesWork();
  const [state, formAction] = useActionState<BindConfirmState, FormData>(async (previous, formData) => {
    // React runs queued submits one after the other: the first one already ended this code.
    if (previous.status === "success") return previous;
    const outcome = await confirmBindCode(readForm(formData, ["code"]), step, accountEmailDeps());
    if ("redirect" in outcome) {
      // A full load: the account page reads the new email, and nothing of this form survives in a route Next keeps.
      window.location.replace(outcome.redirect);
      return { status: "success" };
    }
    if (outcome.restart) onBack({ status: "error", message: outcome.message, values: { newEmail: step.newEmail } });
    return outcome;
  }, initialFormState);
  const secondsLeft = useCountdown(step.resendAvailableAt);
  const waiting = secondsLeft === null || secondsLeft > 0;
  const codeError = state.fieldErrors?.code?.[0];

  return (
    <div className="space-y-5">
      <p className="text-center text-sm break-words text-slate-600">
        We sent a 6-digit code to <span className="font-semibold text-slate-800">{step.sentTo}</span>.
      </p>

      <form action={formAction} className="space-y-5">
        <CookiesRequiredNotice />
        {state.message && <Alert tone="error">{state.message}</Alert>}
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
        <SubmitButton disabled={!cookiesWork}>Verify</SubmitButton>
      </form>

      <Button type="button" variant="ghost" fullWidth disabled={waiting} onClick={() => onBack(resendBindCode(step))}>
        {waiting ? `Send a new code${secondsLeft ? ` in ${formatSeconds(secondsLeft)}` : ""}` : "Send a new code"}
      </Button>
    </div>
  );
}
