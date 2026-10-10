"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { AUTH_ROUTES } from "../constants";
import { clientContextHeaders } from "../lib/client-context";
import { formStateFromError, readForm, validationError, type FormState } from "../lib/form-state";
import { otpSchema } from "../schemas/auth.schema";
import { authService } from "../services/auth.service";
import { readSessionTokens } from "../session/cookies";
import { expiredSessionUrl } from "../session/dal";

export type SendCodeState = FormState & { resendAvailableAt?: string };

async function authContext() {
  const { accessToken } = await readSessionTokens();
  if (!accessToken) redirect(expiredSessionUrl(AUTH_ROUTES.verifyPhone));
  return { accessToken, headers: await clientContextHeaders() };
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.isUnauthorized;
}

/** Takes no arguments: `useActionState` passes (state, formData), and neither is needed. */
export async function sendPhoneCodeAction(): Promise<SendCodeState> {
  const context = await authContext();
  try {
    const result = await authService.sendPhoneCode(context);
    return {
      status: "success",
      message: `We sent a 6-digit code to ${result.sentTo}.`,
      resendAvailableAt: result.resendAvailableAt,
    };
  } catch (error) {
    if (isUnauthorized(error)) redirect(expiredSessionUrl(AUTH_ROUTES.verifyPhone));
    const state: SendCodeState = formStateFromError(error);
    if (error instanceof ApiError && error.status === 429 && error.retryAfterSeconds) {
      state.resendAvailableAt = new Date(Date.now() + error.retryAfterSeconds * 1000).toISOString();
    }
    return state;
  }
}

export async function confirmPhoneAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = otpSchema.safeParse(readForm(formData, ["code"]));
  if (!parsed.success) return validationError(parsed.error);

  const context = await authContext();
  try {
    await authService.confirmPhone(parsed.data.code, context);
  } catch (error) {
    if (isUnauthorized(error)) redirect(expiredSessionUrl(AUTH_ROUTES.verifyPhone));
    return formStateFromError(error);
  }
  redirect(`${AUTH_ROUTES.account}?phone=verified`);
}
