"use server";

import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "../constants";
import { clientContextHeaders } from "../lib/client-context";
import { formStateFromError, readForm, validationError, type FormState } from "../lib/form-state";
import { registerSchema } from "../schemas/auth.schema";
import { authService } from "../services/auth.service";
import { saveSession } from "../session/cookies";
import type { AuthSession } from "../types/auth.types";

export async function registerAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const input = readForm(formData, ["fullName", "username", "email", "idCardNumber", "password", "confirmPassword"]);
  const values = {
    fullName: input.fullName,
    username: input.username,
    email: input.email,
    idCardNumber: input.idCardNumber,
  };

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, values);

  let session: AuthSession;
  try {
    session = await authService.register(parsed.data, { headers: await clientContextHeaders() });
  } catch (error) {
    return formStateFromError(error, { values });
  }

  await saveSession(session);
  redirect(AUTH_ROUTES.verifyPhone);
}
