"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { AUTH_ROUTES } from "../constants";
import { type FormState, initialFormState, readForm } from "../lib/form-state";
import { passwordResetBrowserDeps } from "../lib/password-reset-browser";
import { requestResetByEmail } from "../lib/password-reset-flow";
import { useCookiesWork } from "../lib/use-cookies-work";
import { useFieldErrors } from "../lib/use-field-errors";
import { forgotByEmailSchema } from "../schemas/auth.schema";
import { EMAIL_MAX_RAW_LENGTH } from "../schemas/identifier-policy";
import { CookiesRequiredNotice } from "./cookies-required-notice";
import { FormSkeleton } from "./form-skeleton";

// The form uses a client function as its action: React renders it as a non-submitting `javascript:` action and replays
// a submit made before hydration. The browser dependencies are resolved at submit time.

// A chunk of its own: the phone parser loads only when the SMS tab opens (auth-email-access spec 6.3).
const ForgotSmsForm = dynamic(() => import("./forgot-sms-form").then((module) => module.ForgotSmsForm), {
  loading: () => <FormSkeleton fields={1} />,
});

type Channel = "email" | "sms";

const tabs: { id: Channel; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "sms", label: "Phone" },
];

/** `smsEnabled`: the build opens the phone channel (`on`). Otherwise the page has only the email form. */
export function ForgotPasswordForm({ smsEnabled }: { smsEnabled: boolean }) {
  return smsEnabled ? <ChannelTabs /> : <EmailPanel />;
}

/**
 * Next keeps this route's state between visits, so the sent page would come back with no field: the answer reads the same
 * for any address, and a typo must not be a dead end. Each new try is a fresh form.
 */
function EmailPanel() {
  const [attempt, setAttempt] = useState(0);
  return <EmailForm key={attempt} onStartOver={() => setAttempt((value) => value + 1)} />;
}

function ChannelTabs() {
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
        {channel === "email" ? <EmailPanel /> : <ForgotSmsForm />}
      </div>
    </div>
  );
}

function EmailForm({ onStartOver }: { onStartOver(): void }) {
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
        <Button type="button" variant="ghost" fullWidth onClick={onStartOver}>
          Use another email
        </Button>
        <Link
          href={AUTH_ROUTES.login}
          onClick={onStartOver}
          className="block text-center text-sm font-semibold text-violet-700 hover:text-violet-800"
        >
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      <CookiesRequiredNotice />
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <FormField id="email" label="Email" error={error}>
        <Input
          id="email"
          name="email"
          type="text"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={EMAIL_MAX_RAW_LENGTH}
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
