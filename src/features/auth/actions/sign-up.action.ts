"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { AUTH_ROUTES } from "../constants";
import { clientContextHeaders } from "../lib/client-context";
import { formStateFromError, readForm, validationError, type FormState } from "../lib/form-state";
import { isFuture } from "../lib/signup-progress";
import { otpSchema, signUpPhoneSchema } from "../schemas/auth.schema";
import { authService } from "../services/auth.service";
import { readSignUpEntry, saveSignUpEntry } from "../session/cookies";

// "Verify first, register later": /sign-up (phone) → /sign-up/verify (SMS code) → /sign-up/details
// (name and password, see register.action.ts). The progress lives in the httpOnly `sv_signup` cookie.

export type ResendState = FormState & { resendAvailableAt?: string };

/** Step 1: texts a code to the phone number and moves to the code page. */
export async function startSignUpAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = readForm(formData, ["username"]);
  const parsed = signUpPhoneSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error, values);
  const phone = parsed.data.username;

  // Coming back with the same number must not cost another SMS: carry on where the visitor left off
  const existing = await readSignUpEntry();
  if (existing?.phone === phone) {
    if (existing.registrationToken && isFuture(existing.tokenExpiresAt)) redirect(AUTH_ROUTES.signUpDetails);
    if (!existing.registrationToken && isFuture(existing.resendAvailableAt)) redirect(AUTH_ROUTES.signUpVerify);
  }

  let resendAvailableAt: string;
  try {
    ({ resendAvailableAt } = await authService.sendRegistrationCode(phone, { headers: await clientContextHeaders() }));
  } catch (error) {
    // A taken number comes back as a field error on `username`, shown under the input
    return formStateFromError(error, { values });
  }

  await saveSignUpEntry({ phone, resendAvailableAt });
  redirect(AUTH_ROUTES.signUpVerify);
}

/** Asks for another code for the phone number in progress. Takes no form data. */
export async function resendSignUpCodeAction(): Promise<ResendState> {
  const entry = await readSignUpEntry();
  if (!entry) redirect(AUTH_ROUTES.signUp);
  if (entry.registrationToken) redirect(AUTH_ROUTES.signUpDetails);

  try {
    const result = await authService.sendRegistrationCode(entry.phone, { headers: await clientContextHeaders() });
    await saveSignUpEntry({ phone: entry.phone, resendAvailableAt: result.resendAvailableAt });
    return { status: "success", message: "We sent you a new code.", resendAvailableAt: result.resendAvailableAt };
  } catch (error) {
    const state: ResendState = formStateFromError(error);
    const taken = state.fieldErrors?.username?.[0];
    if (taken) return { status: "error", message: taken };
    if (error instanceof ApiError && error.status === 429 && error.retryAfterSeconds) {
      state.resendAvailableAt = new Date(Date.now() + error.retryAfterSeconds * 1000).toISOString();
    }
    return state;
  }
}

/** Step 2: exchanges the code for the registration token and moves to the details page. */
export async function verifySignUpCodeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = otpSchema.safeParse(readForm(formData, ["code"]));
  if (!parsed.success) return validationError(parsed.error);

  const entry = await readSignUpEntry();
  if (!entry) redirect(AUTH_ROUTES.signUp);
  if (entry.registrationToken) redirect(AUTH_ROUTES.signUpDetails);

  let result: Awaited<ReturnType<typeof authService.verifyRegistrationCode>>;
  try {
    result = await authService.verifyRegistrationCode(entry.phone, parsed.data.code, {
      headers: await clientContextHeaders(),
    });
  } catch (error) {
    // auth-service tells a wrong code from a burned or expired one; its messages are safe to show
    if (error instanceof ApiError && error.status === 400 && error.fieldErrors.length === 0 && error.message) {
      return { status: "error", message: error.message };
    }
    return formStateFromError(error);
  }

  await saveSignUpEntry({
    phone: entry.phone,
    registrationToken: result.registrationToken,
    tokenExpiresAt: result.expiresAt,
  });
  redirect(AUTH_ROUTES.signUpDetails);
}
