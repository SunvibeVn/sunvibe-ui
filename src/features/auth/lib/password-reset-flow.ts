import type { components } from "@/api/generated/schema";
import type { PublicApiResult } from "@/lib/api";
import { AUTH_ROUTES } from "../constants";
import { forgotByEmailSchema, forgotBySmsSchema, resetPasswordSchema } from "../schemas/auth.schema";
import { type BrowserEnvironment, cookiesAndStorageWork } from "../session/browser-cookies";
import type { SessionApi } from "../session/session-api";
import type { SessionStore } from "../session/session-store";
import { AUTH_ERROR_TEXT } from "./auth-error-text";
import { type FormState, formStateFromResult, validationError } from "./form-state";
import { createPublicAuthClient } from "./public-auth-client";
import { clearResetProgress, readResetProgress, saveResetToken } from "./reset-progress";
import { sessionStorageOf } from "./session-storage";

// Forgot and reset password from the browser (auth-browser-session §5 `/forgot-password`, `/reset-password`). The SMS
// reset token and the token of an e-mail link wait in this tab's sessionStorage (auth-browser-session C-7). Every
// check runs inside these functions, not only on the buttons: React replays a submit made before hydration through
// the form action (auth-browser-session §4.9). Nothing here logs.

export type PasswordResetStartResponse = components["schemas"]["PasswordResetStartResponse"];

/** The two anonymous calls that send a reset code (no cookie, no Authorization, no Web Lock). */
export type PasswordResetApi = {
  byEmail(email: string): Promise<PublicApiResult<PasswordResetStartResponse>>;
  bySms(phoneNumber: string): Promise<PublicApiResult<PasswordResetStartResponse>>;
};

const send = createPublicAuthClient();

export const passwordResetApi: PasswordResetApi = {
  byEmail: (email) => send((client) => client.POST("/api/v1/auth/password-reset/email", { body: { email } })),
  bySms: (phoneNumber) =>
    send((client) => client.POST("/api/v1/auth/password-reset/sms", { body: { phoneNumber } })),
};

export type PasswordResetDeps = {
  reset: PasswordResetApi;
  api: Pick<SessionApi, "completePasswordReset">;
  store: Pick<SessionStore, "endLocally">;
  /** The page's `window` (or a window-like object), read at submit time. */
  env: BrowserEnvironment;
};

export type Redirect = { redirect: string };

const EMAIL_SENT =
  "If an account uses this email, we've sent it a 6-digit code and a reset link. Open the link to choose a new password.";
const SMS_SENT = "If an account uses this phone number, we've sent it a 6-digit code.";

/** E-mails a code and a reset link. The answer reads the same whether or not the account exists. */
export async function requestResetByEmail(
  values: { email: string },
  deps: Pick<PasswordResetDeps, "reset" | "env">,
): Promise<FormState> {
  const kept = { email: values.email };
  // auth-browser-session S-18: the reset ends on a page that needs cookies and sessionStorage, so send nothing.
  if (!cookiesAndStorageWork(deps.env)) return { status: "error", message: AUTH_ERROR_TEXT.cookiesRequired, values: kept };

  const parsed = forgotByEmailSchema.safeParse(kept);
  if (!parsed.success) return validationError(parsed.error, kept);

  const result = await deps.reset.byEmail(parsed.data.email);
  if (!result.ok) return formStateFromResult(result, { values: kept, screen: "reset" });
  return { status: "success", message: EMAIL_SENT, values: kept };
}

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

export type ResetValues = { otpCode: string; newPassword: string; confirmPassword: string };

/**
 * Sets the new password with the reset token of this tab (never one from the form). auth-service then ends every
 * session of the account and clears the refresh cookie; this browser ends its session locally too, which clears the
 * hint and tells every other tab (auth-browser-session US-4 AC-3). The state returned never holds a password.
 */
export async function completeReset(values: ResetValues, deps: PasswordResetDeps): Promise<FormState | Redirect> {
  const storage = sessionStorageOf(deps.env);
  const progress = readResetProgress(storage);
  if (!progress) return { status: "error", message: AUTH_ERROR_TEXT.resetTokenInvalid };

  const parsed = resetPasswordSchema.safeParse({
    resetToken: progress.token,
    otpCode: values.otpCode,
    newPassword: values.newPassword,
    confirmPassword: values.confirmPassword,
  });
  if (!parsed.success) return validationError(parsed.error);

  let result: Awaited<ReturnType<PasswordResetDeps["api"]["completePasswordReset"]>>;
  try {
    result = await deps.api.completePasswordReset(parsed.data);
  } catch {
    // For example a missing API URL or a refused Web Lock: the reset token stays for another try.
    return { status: "error", message: AUTH_ERROR_TEXT.generic };
  }
  if (!result.ok) {
    // auth-browser-session C-7: a used or expired reset token leaves this tab's storage at once.
    if (result.kind === "http" && result.code === "RESET_TOKEN_INVALID") clearResetProgress(storage);
    return formStateFromResult(result, { screen: "reset" });
  }

  clearResetProgress(storage);
  deps.store.endLocally("signed-out");
  return { redirect: `${AUTH_ROUTES.login}?reset=success` };
}
