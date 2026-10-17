"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { AUTH_ROUTES } from "../constants";
import { type FormState, initialFormState, readForm } from "../lib/form-state";
import { passwordResetBrowserDeps } from "../lib/password-reset-browser";
import { requestResetByEmail, requestResetBySms } from "../lib/password-reset-flow";
import { useCookiesWork } from "../lib/use-cookies-work";
import { useFieldErrors } from "../lib/use-field-errors";
import { forgotByEmailSchema, forgotBySmsSchema } from "../schemas/auth.schema";
import { CookiesRequiredNotice } from "./cookies-required-notice";

// Both forms use a client function as the form action: React renders it as a non-submitting `javascript:` action and
// replays a submit made before hydration. The browser dependencies are resolved at submit time.

type Channel = "email" | "sms";

const tabs: { id: Channel; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "sms", label: "Phone" },
];

export function ForgotPasswordForm() {
  const [channel, setChannel] = useState<Channel>("email");
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Reset method" className="grid grid-cols-2 rounded-full bg-slate-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={channel === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setChannel(tab.id)}
            className={`rounded-full py-2 text-sm font-semibold transition-colors ${
              channel === tab.id ? "bg-white text-navy-950 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div id={`panel-${channel}`} role="tabpanel" aria-labelledby={`tab-${channel}`}>
        {channel === "email" ? <EmailForm /> : <SmsForm />}
      </div>
    </div>
  );
}

function EmailForm() {
  const cookiesWork = useCookiesWork();
  const [state, formAction] = useActionState(
    (_previous: FormState, formData: FormData) =>
      requestResetByEmail(readForm(formData, ["email"]), passwordResetBrowserDeps()),
    initialFormState,
  );
  const { onBlur, errorFor } = useFieldErrors(forgotByEmailSchema, state.fieldErrors);
  const error = errorFor("email");

  if (state.status === "success") {
    return (
      <div className="space-y-5">
        <Alert tone="success" title="Check your inbox">
          {state.message}
        </Alert>
        <Link href={AUTH_ROUTES.login} className="block text-center text-sm font-semibold text-violet-700 hover:text-violet-800">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      <CookiesRequiredNotice />
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <FormField id="email" label="Email address" error={error}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          invalid={Boolean(error)}
          aria-describedby={describedBy("email", error)}
        />
      </FormField>
      <SubmitButton disabled={!cookiesWork}>Email me a reset link</SubmitButton>
    </form>
  );
}

function SmsForm() {
  const router = useRouter();
  const cookiesWork = useCookiesWork();
  const [state, formAction] = useActionState(async (_previous: FormState, formData: FormData): Promise<FormState> => {
    const values = readForm(formData, ["phoneNumber"]);
    const outcome = await requestResetBySms(values, passwordResetBrowserDeps());
    if (!("redirect" in outcome)) return outcome;
    router.push(outcome.redirect);
    // Keeps the typed number in the field while the next page loads.
    return { status: "success", values } satisfies FormState;
  }, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(forgotBySmsSchema, state.fieldErrors);
  const error = errorFor("phoneNumber");

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      <CookiesRequiredNotice />
      {state.message && <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>}
      <FormField id="phoneNumber" label="Phone number" error={error}>
        <Input
          id="phoneNumber"
          name="phoneNumber"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0901 234 567"
          required
          defaultValue={state.values?.phoneNumber}
          invalid={Boolean(error)}
          aria-describedby={describedBy("phoneNumber", error)}
        />
      </FormField>
      <SubmitButton disabled={!cookiesWork}>Text me a code</SubmitButton>
    </form>
  );
}
