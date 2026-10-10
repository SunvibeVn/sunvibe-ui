"use server";

import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "../constants";
import { clientContextHeaders } from "../lib/client-context";
import { formStateFromError, readForm, validationError, type FormState } from "../lib/form-state";
import { resetPasswordSchema } from "../schemas/auth.schema";
import { authService } from "../services/auth.service";
import { clearResetToken, clearSession, readResetToken } from "../session/cookies";

export async function resetPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const input = readForm(formData, ["resetToken", "otpCode", "newPassword", "confirmPassword"]);
  // E-mail flow: token from the link (hidden field). SMS flow: token from the sv_reset cookie.
  const resetToken = input.resetToken || (await readResetToken());
  if (!resetToken) {
    return { status: "error", message: "This reset link is invalid or has expired. Request a new one." };
  }

  const parsed = resetPasswordSchema.safeParse({ ...input, resetToken });
  if (!parsed.success) return validationError(parsed.error);

  try {
    await authService.resetPassword(parsed.data, { headers: await clientContextHeaders() });
  } catch (error) {
    return formStateFromError(error);
  }

  // The backend signed out every device; drop this browser's cookies too.
  await clearResetToken();
  await clearSession();
  redirect(`${AUTH_ROUTES.login}?reset=success`);
}
