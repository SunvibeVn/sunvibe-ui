"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { AUTH_ROUTES } from "../constants";
import { clientContextHeaders } from "../lib/client-context";
import { formStateFromError, readForm, validationError, type FormState } from "../lib/form-state";
import { isFuture } from "../lib/signup-progress";
import { signUpDetailsSchema } from "../schemas/auth.schema";
import { authService } from "../services/auth.service";
import { clearSignUpEntry, readSignUpEntry, saveSession } from "../session/cookies";
import type { AuthSession } from "../types/auth.types";

/**
 * Last sign-up step. The phone number and the registration token come from the
 * `sv_signup` cookie (set by sign-up.action.ts after the SMS code was confirmed),
 * never from the form, so the account can only be created for the verified number.
 */
export async function registerAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const input = readForm(formData, ["fullName", "password", "confirmPassword"]);
  const values = { fullName: input.fullName };

  const entry = await readSignUpEntry();
  if (!entry) redirect(AUTH_ROUTES.signUp);
  if (!entry.registrationToken) redirect(AUTH_ROUTES.signUpVerify);
  if (!isFuture(entry.tokenExpiresAt)) redirect(`${AUTH_ROUTES.signUp}?expired=1`);

  const parsed = signUpDetailsSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, values);

  let session: AuthSession;
  try {
    session = await authService.register(
      {
        fullName: parsed.data.fullName,
        username: entry.phone,
        email: "",
        idCardNumber: "",
        password: parsed.data.password,
        confirmPassword: parsed.data.confirmPassword,
        registrationToken: entry.registrationToken,
      },
      { headers: await clientContextHeaders() },
    );
  } catch (error) {
    // 400 without field errors: auth-service refused the token (used, expired or for another number)
    if (error instanceof ApiError && error.status === 400 && error.fieldErrors.length === 0) {
      await clearSignUpEntry();
      redirect(`${AUTH_ROUTES.signUp}?expired=1`);
    }
    const state = formStateFromError(error, { values });
    // The form has no phone field: a number taken in the meantime is told in the alert instead
    const taken = state.fieldErrors?.username?.[0];
    return taken ? { status: "error", message: taken, values } : state;
  }

  await saveSession(session);
  await clearSignUpEntry();
  redirect(session.phoneVerified ? `${AUTH_ROUTES.account}?phone=verified` : AUTH_ROUTES.verifyPhone);
}
