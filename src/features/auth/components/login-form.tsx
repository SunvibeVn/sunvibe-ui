"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { ArrowRightIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { AUTH_ROUTES } from "../constants";
import { type FormState, initialFormState, readForm } from "../lib/form-state";
import { type LoginDeps, submitLogin } from "../lib/login-flow";
import { useCookiesWork } from "../lib/use-cookies-work";
import { useFieldErrors } from "../lib/use-field-errors";
import { loginSchema } from "../schemas/auth.schema";
import { documentJar } from "../session/browser-cookies";
import { settlePendingLogoutBeforeSignIn } from "../session/logout";
import { sessionApi } from "../session/session-api";
import { sessionStore } from "../session/session-store";
import { CookiesRequiredNotice } from "./cookies-required-notice";

// Resolved at submit time, in the browser: nothing reads `window` while the form renders on the server.
const browserDeps = (): LoginDeps => ({
  api: sessionApi,
  store: sessionStore,
  jar: documentJar,
  env: window,
  settlePending: settlePendingLogoutBeforeSignIn,
});

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const cookiesWork = useCookiesWork();
  // A client function as the form action: React renders it as a non-submitting `javascript:` action and replays a
  // submit made before hydration, so the password never lands in a URL.
  const [state, formAction] = useActionState(async (previous: FormState, formData: FormData) => {
    const outcome = await submitLogin(readForm(formData, ["username", "password", "next"]), browserDeps());
    if (!("redirect" in outcome)) return outcome;
    router.replace(outcome.redirect);
    return { status: "success", values: previous.values } satisfies FormState;
  }, initialFormState);
  const { onBlur, errorFor } = useFieldErrors(loginSchema, state.fieldErrors);
  const phoneError = errorFor("username");
  const passwordError = errorFor("password");

  return (
    <form action={formAction} onBlur={onBlur} noValidate className="space-y-5">
      <CookiesRequiredNotice />
      {state.message && <Alert tone="error">{state.message}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}

      <FormField id="username" label="Phone number" error={phoneError}>
        <Input
          compact
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
          compact
          id="password"
          name="password"
          autoComplete="current-password"
          required
          invalid={Boolean(passwordError)}
          aria-describedby={describedBy("password", passwordError)}
        />
      </FormField>

      <SubmitButton disabled={!cookiesWork}>
        Log in <ArrowRightIcon size={16} />
      </SubmitButton>
    </form>
  );
}
