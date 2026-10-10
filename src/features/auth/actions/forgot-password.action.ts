"use server";

import { redirect } from "next/navigation";
import { AUTH_ROUTES, SMS_RESEND_COOLDOWN_SECONDS } from "../constants";
import { clientContextHeaders } from "../lib/client-context";
import { formStateFromError, readForm, validationError, type FormState } from "../lib/form-state";
import { forgotByEmailSchema, forgotBySmsSchema } from "../schemas/auth.schema";
import { authService } from "../services/auth.service";
import { readResetEntry, saveResetToken } from "../session/cookies";
import type { PasswordForgotResult } from "../types/auth.types";

export async function forgotPasswordByEmailAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = readForm(formData, ["email"]);
  const parsed = forgotByEmailSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error, values);

  try {
    await authService.forgotPasswordByEmail(parsed.data.email, { headers: await clientContextHeaders() });
  } catch (error) {
    return formStateFromError(error, { values });
  }
  return {
    status: "success",
    message:
      "If an account uses this email, we've sent it a 6-digit code and a reset link. Open the link to choose a new password.",
    values,
  };
}

export async function forgotPasswordBySmsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = readForm(formData, ["phoneNumber"]);
  const parsed = forgotBySmsSchema.safeParse(values);
  if (!parsed.success) return validationError(parsed.error, values);

  let result: PasswordForgotResult;
  try {
    result = await authService.forgotPasswordBySms(parsed.data.phoneNumber, { headers: await clientContextHeaders() });
  } catch (error) {
    return formStateFromError(error, { values });
  }

  if (!result.resetToken) {
    return { status: "success", message: "If an account uses this phone number, we've sent it a 6-digit code.", values };
  }
  // Inside the backend's cooldown the answer carries a decoy token and no SMS is
  // sent: keep the token whose code is already on its way.
  const phone = parsed.data.phoneNumber;
  const existing = await readResetEntry();
  const withinCooldown =
    existing?.phone === phone && Date.now() - existing.issuedAt < SMS_RESEND_COOLDOWN_SECONDS * 1000;
  if (!withinCooldown) await saveResetToken(result.resetToken, phone);
  redirect(`${AUTH_ROUTES.resetPassword}?via=sms`);
}
