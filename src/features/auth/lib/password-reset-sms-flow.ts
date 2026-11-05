import { AUTH_ROUTES } from "../constants";
import { forgotBySmsSchema } from "../schemas/phone-auth.schema";
import { cookiesAndStorageWork } from "../session/browser-cookies";
import { AUTH_ERROR_TEXT } from "./auth-error-text";
import { type FormState, formStateFromResult, validationError } from "./form-state";
import type { PasswordResetDeps, Redirect } from "./password-reset-flow";
import { saveResetToken } from "./reset-progress";
import { sessionStorageOf } from "./session-storage";

// The SMS start of a reset, apart from password-reset-flow.ts because it reaches the phone parser: only the SMS tab of
// `/forgot-password` loads it, and only when that tab is open (auth-email-access spec 6.1, 6.3).

const SMS_SENT = "If an account uses this phone number, we've sent it a 6-digit code.";

/** Texts a code; when the answer carries a reset token, keeps it in this tab and moves to the reset page. */
export async function requestResetBySms(
  values: { phoneNumber: string },
  deps: Pick<PasswordResetDeps, "reset" | "env">,
): Promise<FormState | Redirect> {
  const kept = { phoneNumber: values.phoneNumber };
  // auth-browser-session S-18: the SMS token waits in sessionStorage, so without it send nothing.
  if (!cookiesAndStorageWork(deps.env)) return { status: "error", message: AUTH_ERROR_TEXT.cookiesRequired, values: kept };

  const parsed = forgotBySmsSchema.safeParse(kept);
  if (!parsed.success) return validationError(parsed.error, kept);
  const phone = parsed.data.phoneNumber;

  const result = await deps.reset.bySms(phone);
  if (!result.ok) return formStateFromResult(result, { values: kept, screen: "reset" });

  const { resetToken } = result.data;
  if (!resetToken) return { status: "success", message: SMS_SENT, values: kept };
  // Inside the resend cooldown the token is a decoy and no SMS is sent: saveResetToken keeps the real one.
  saveResetToken(sessionStorageOf(deps.env), resetToken, phone);
  return { redirect: `${AUTH_ROUTES.resetPassword}?via=sms` };
}
