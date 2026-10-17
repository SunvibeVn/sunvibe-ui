"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { secondsLeft, type Countdown } from "../lib/countdown";
import { fieldElementId, firstInvalidField, type FieldErrorMessage } from "../lib/field-errors";
import { EMPTY_FORM_VALUES } from "../lib/form-values";
import { createIdempotencyKeys } from "../lib/idempotency";
import { canSubmit, INITIAL_SUBMIT_STATE, submitStateAfter, type SubmitState } from "../lib/submit-state";
import { submitOwnerIntake } from "../services/submit-owner-intake";
import type { FieldName, FormValues } from "../types/form";

import { ConsentField } from "./consent-field";
import { LocationPicker } from "./location-picker";
import { OwnerIntakeFields } from "./owner-intake-fields";
import { SubmitSuccess } from "./submit-success";

type SubmitIntent = { type: "submit"; values: FormValues } | { type: "restart" };

/** Seconds left of the 429 wait, ticking once a second; the timer stops at 0 and on unmount. */
function useSecondsLeft(wait: Countdown | undefined): number {
  // 0 is before any wait started, so the first render shows the full wait.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!wait) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (secondsLeft(wait, current) === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [wait]);
  return wait ? secondsLeft(wait, now) : 0;
}

/**
 * The owner intake form and its submit flow (handoff 2.3 and section 4): one request in flight, an Idempotency-Key
 * per body, every error state, the 429 wait and the success screen.
 */
export function OwnerIntakeForm() {
  const t = useTranslations("OwnerIntake");
  const [values, setValues] = useState<FormValues>(EMPTY_FORM_VALUES);
  const [catalogReady, setCatalogReady] = useState(false);
  const [locating, setLocating] = useState(false);
  // Lives as long as the form, so a retry of the same body reuses its key.
  const [keys] = useState(() => createIdempotencyKeys());
  // Set synchronously on submit, before React renders `pending`: a second click in between is ignored.
  const inFlight = useRef(false);

  const [state, dispatch, pending] = useActionState(
    async (_previous: SubmitState, intent: SubmitIntent): Promise<SubmitState> => {
      if (intent.type === "restart") return INITIAL_SUBMIT_STATE;
      try {
        // fieldErrorMessage builds keys from field names at runtime; t.has checks them (typed keys only statically).
        const has = (key: string) => t.has(key as Parameters<typeof t.has>[0]);
        const outcome = await submitOwnerIntake(intent.values, { keys, has });
        // Clear the owner's data with the success screen, not before it.
        if (outcome.kind === "success") startTransition(() => setValues(EMPTY_FORM_VALUES));
        return submitStateAfter(outcome, Date.now());
      } finally {
        inFlight.current = false;
      }
    },
    INITIAL_SUBMIT_STATE,
  );

  const outcome = state.status === "editing" ? state.outcome : undefined;
  const waitLeft = useSecondsLeft(state.status === "editing" ? state.wait : undefined);

  // Focus the first invalid field (client or server errors) once the inputs are enabled again.
  useEffect(() => {
    if (state.status !== "editing" || !state.outcome) return;
    const field = firstInvalidField(state.outcome.fieldErrors);
    if (field) document.getElementById(fieldElementId(field))?.focus();
  }, [state]);

  // Every change is ignored while a request is in flight, including a location that resolves mid-submit:
  // the body must not change under its key.
  const update = (change: (current: FormValues) => FormValues) => {
    if (!inFlight.current) setValues(change);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit({ inFlight: inFlight.current, catalogReady, waitLeft, locating })) return;
    inFlight.current = true;
    startTransition(() => dispatch({ type: "submit", values }));
  };

  if (state.status === "sent") {
    return (
      <SubmitSuccess
        requestCode={state.requestCode}
        onRestart={() => startTransition(() => dispatch({ type: "restart" }))}
      />
    );
  }

  const submitBlocked = !canSubmit({ inFlight: pending, catalogReady, waitLeft, locating });
  const fieldErrors = outcome?.fieldErrors ?? {};
  // Keys come from fieldErrorMessage, which checked them with t.has (or fell back to errors.generic).
  const text = (message: FieldErrorMessage | undefined) =>
    message && t(message.key as Parameters<typeof t>[0], message.values);
  const errorText = (field: FieldName) => text(fieldErrors[field]);
  const pin =
    values.latitude !== undefined && values.longitude !== undefined
      ? { latitude: values.latitude, longitude: values.longitude }
      : undefined;

  return (
    // noValidate: native `required` / `type="email"` checks would pre-empt the Vietnamese messages and the focus.
    // onSubmit, not <form action>: React resets the form after an action, which desyncs controlled selects and
    // textareas from the state when an error keeps the form on screen.
    // method="post" and no `name` on the controls: a submit before hydration sends nothing in the URL (the body is
    // built from the state, never from FormData).
    <form method="post" noValidate onSubmit={submit} className="space-y-6" aria-busy={pending || undefined}>
      <OwnerIntakeFields
        values={values}
        onChange={update}
        errors={fieldErrors}
        disabled={pending}
        onCatalogReadyChange={setCatalogReady}
        location={
          <LocationPicker
            value={pin}
            onChange={(next) => update((current) => ({ ...current, latitude: next?.latitude, longitude: next?.longitude }))}
            disabled={values.wardType === "SPECIAL_ZONE"}
            wardName={values.wardName}
            readOnly={pending}
            onLocatingChange={setLocating}
            latitudeError={errorText("latitude")}
            longitudeError={errorText("longitude")}
          />
        }
      />
      <ConsentField
        checked={values.consent.accepted}
        onChange={(accepted) => update((current) => ({ ...current, consent: { accepted } }))}
        error={errorText("consent.accepted")}
        disabled={pending}
      />

      {outcome?.message && (
        <Alert tone="error">
          <p>{t(outcome.message)}</p>
          {outcome.supportCode && (
            <p className="mt-0.5 text-xs">{t("errors.supportCode", { correlationId: outcome.supportCode })}</p>
          )}
          {outcome.retryable && (
            <Button type="submit" variant="secondary" className="mt-2 px-4 py-1.5" disabled={submitBlocked}>
              {t("errors.retry")}
            </Button>
          )}
        </Alert>
      )}

      <Button type="submit" fullWidth pending={pending} disabled={submitBlocked}>
        {pending
          ? t("submit.submitting")
          : waitLeft > 0
            ? t("submit.waitCountdown", { seconds: waitLeft })
            : t("submit.idle")}
      </Button>
    </form>
  );
}
