"use server";

import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "../constants";
import { clientContextHeaders } from "../lib/client-context";
import { formStateFromError, readForm, validationError, type FormState } from "../lib/form-state";
import { safeRedirectPath } from "../lib/safe-redirect";
import { loginSchema } from "../schemas/auth.schema";
import { authService } from "../services/auth.service";
import { saveSession } from "../session/cookies";
import type { AuthSession } from "../types/auth.types";

export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const input = readForm(formData, ["username", "password"]);
  const values = { username: input.username };

  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, values);

  let session: AuthSession;
  try {
    session = await authService.login(parsed.data, { headers: await clientContextHeaders() });
  } catch (error) {
    return formStateFromError(error, { values, overrides: { 401: "Phone number or password is incorrect." } });
  }

  await saveSession(session);
  const next = safeRedirectPath(formData.get("next"), AUTH_ROUTES.account);
  redirect(session.phoneVerified ? next : AUTH_ROUTES.verifyPhone);
}
